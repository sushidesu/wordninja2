import { Hono } from "hono";
import { game } from "./game/api";
import type { RoomDO } from "./game/room-do";
import { GamePage } from "./game/web";

// 公開する Worker。エンドユーザーが触れるのはここだけ。
// お題工房(src/topics/)のルートは載せない。D1 は採用済みお題を読むためだけに使い、
// 書き込みはしない。埋め込み生成は工房の都合なので AI バインディングも持たない。
type Bindings = { DB: D1Database; ROOM: DurableObjectNamespace<RoomDO> };

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api", game);

app.get("/", (c) => c.html(GamePage()));
// 招待リンク。部屋コードは URL に載せるだけで、返すページは同じ。
app.get("/rooms/:code", (c) => c.html(GamePage()));

export { RoomDO } from "./game/room-do";

export default app;
