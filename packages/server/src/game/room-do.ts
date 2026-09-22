import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  actionSchema,
  applyAction,
  emptyRoom,
  playerIdSchema,
  viewFor,
  type Action,
  type Room,
  type ServerMessage,
  type WordAssignment,
} from "@wordninja/rules";
import { createDb } from "../db";
import { randomAcceptedWords } from "../topics/repo";

type Env = { ROOM: DurableObjectNamespace<RoomDO>; DB: D1Database };

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
    const msg = parseMessage(message);
    if (msg === null) return this.send(ws, { type: "rejected" });

    // 自動のお題は、ホストにも見せないためサーバー側で選んで deal に変換する。
    // 規則は deal しか知らない(applyAction を純関数に保つ)。
    const action =
      msg.type === "dealAuto" ? await this.resolveAutoDeal(msg.by) : msg;
    if (action === null) return this.send(ws, { type: "rejected" });

    const next = applyAction(this.room, action);
    if (next === null) return this.send(ws, { type: "rejected" });

    this.room = next;
    await this.ctx.storage.put("room", next);
    this.broadcast();
  }

  /** 採用済みプールから語を引き、プレイヤーへ配る deal を組み立てる。 */
  private async resolveAutoDeal(by: string): Promise<Action | null> {
    const { players, teamCount } = this.room;
    if (players.length < teamCount) return null;
    const pool = await randomAcceptedWords(createDb(this.env.DB), teamCount);
    if (pool === undefined) return null;
    return {
      type: "deal",
      by,
      words: assignWords(players, pool),
      firstAsker: players[Math.floor(Math.random() * players.length)],
    };
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

// dealAuto は規則ではなく transport のメッセージ。ここで deal へ変換する。
const clientMessageSchema = z.union([
  z.object({ type: z.literal("dealAuto"), by: playerIdSchema }),
  actionSchema,
]);
type ClientMessage = z.infer<typeof clientMessageSchema>;

// ネットワーク越しの入力なので、壊れた JSON も通常の経路の一部として扱う。
const parseMessage = (message: string | ArrayBuffer): ClientMessage | null => {
  if (typeof message !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }
  const parsed = clientMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** 語をプレイヤーへ配る。全ての語が最低1人に渡るよう順に割り当てる。 */
const assignWords = (players: string[], pool: string[]): WordAssignment[] => {
  const order = [...players.keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const word = new Map<number, string>();
  order.forEach((playerIndex, i) => word.set(playerIndex, pool[i % pool.length]));
  // validDeal は players と同じ並びを要求する。
  return players.map((p, i) => ({ player: p, word: word.get(i)! }));
};
