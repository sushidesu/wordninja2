import { DurableObject } from "cloudflare:workers";
import {
  actionSchema,
  applyAction,
  emptyRoom,
  viewFor,
  type Action,
  type Room,
  type ServerMessage,
} from "@wordninja/rules";

type Env = { ROOM: DurableObjectNamespace<RoomDO> };

/** 接続ごとに持つ情報。ハイバネートを越えて生き残る。 */
type Session = { player: string };

/**
 * 部屋1つ = このインスタンス1つ。権威状態を保持し、アクションを直列化する。
 * 規則は一切持たず、受信 → 検証 → @wordninja/rules へ委譲 → 射影を配る、の一本道。
 */
export class RoomDO extends DurableObject<Env> {
  private room: Room = emptyRoom();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // ハイバネートから復帰するとメモリ上の状態は失われるので読み直す。
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>("room")) ?? emptyRoom();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    const player = new URL(request.url).searchParams.get("player");
    if (player === null) return new Response("player required", { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    // ws.accept() ではハイバネートできない。
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ player } satisfies Session);
    this.send(server, { type: "state", view: viewFor(this.room, player) });
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const action = parseAction(message);
    if (action === null) return this.send(ws, { type: "rejected" });

    const next = applyAction(this.room, action);
    if (next === null) return this.send(ws, { type: "rejected" });

    this.room = next;
    await this.ctx.storage.put("room", next);
    this.broadcast();
  }

  private broadcast(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const { player } = ws.deserializeAttachment() as Session;
      this.send(ws, { type: "state", view: viewFor(this.room, player) });
    }
  }

  /** 送れるのは ServerMessage だけ。Room がワイヤに乗らないことが型で閉じる。 */
  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}

// ネットワーク越しの入力なので、壊れた JSON も通常の経路の一部として扱う。
const parseAction = (message: string | ArrayBuffer): Action | null => {
  if (typeof message !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }
  const parsed = actionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
