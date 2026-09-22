import { Hono } from "hono";
import type { RoomDO } from "./room-do";

type Bindings = { ROOM: DurableObjectNamespace<RoomDO> };

// 紛らわしい文字(I/O/0/1)を除いた32文字。256 が 32 で割り切れるので剰余の偏りが出ない。
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const newRoomCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length])
    .join("");

// メソッドチェーンで型を積み上げる(クライアントが hc で型付きに叩けるようにするため)。
export const game = new Hono<{ Bindings: Bindings }>()
  // 部屋は getByName で暗黙に存在するので、発行するのはコードだけ。登録簿を持たない。
  .post("/rooms", (c) => c.json({ code: newRoomCode() }))
  .get("/rooms/:code/ws", (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.text("expected websocket", 426);
    }
    return c.env.ROOM.getByName(c.req.param("code")).fetch(c.req.raw);
  });

export type GameAppType = typeof game;
