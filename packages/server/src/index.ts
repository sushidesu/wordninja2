import { Hono } from "hono";
import { game } from "./game/api";
import { GamePage } from "./game/web";
import type { RoomDO } from "./game/room-do";
import { api } from "./topics/api";
import { isValidRating, WORDS_PER_TOPIC } from "./topics/config";
import { createDb } from "./db";
import * as repo from "./topics/repo";
import { ReviewPage, TopicDetailPage, TopicsListPage } from "./topics/views";

type Bindings = { DB: D1Database; AI: Ai; ROOM: DurableObjectNamespace<RoomDO> };

const app = new Hono<{ Bindings: Bindings }>();

const parseWords = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

const field = (body: Record<string, string | File>, key: string): string =>
  typeof body[key] === "string" ? body[key] : "";

app.route("/api", api);
app.route("/api/game", game);

app.get("/game", (c) => c.html(GamePage()));

// ---- 人間用 Web UI（SSR + フォームPOST。/review は人間用クライアント）----

app.get("/", async (c) => {
  const all = await repo.listTopics(createDb(c.env.DB));
  const filter = c.req.query("filter") ?? "all";
  const topics = all.filter((t) =>
    filter === "unrated"
      ? t.score === null
      : filter === "accepted"
        ? t.accepted
        : filter === "rejected"
          ? t.score !== null && !t.accepted
          : true,
  );
  return c.html(
    TopicsListPage({ topics, summary: repo.summarize(all), filter })!,
  );
});

app.get("/review", (c) => c.html(ReviewPage({})!));

app.get("/topics/:id", async (c) => {
  const t = await repo.getTopic(createDb(c.env.DB), c.req.param("id"));
  return t ? c.html(TopicDetailPage({ topic: t })!) : c.notFound();
});

app.post("/topics", async (c) => {
  const body = await c.req.parseBody();
  const wordList = parseWords(field(body, "words"));
  if (wordList.length !== WORDS_PER_TOPIC) return c.redirect("/", 303);
  const { id } = await repo.createTopic(createDb(c.env.DB), wordList, "manual");
  return c.redirect(`/topics/${id}`, 303);
});

app.post("/topics/:id/words", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const wordList = parseWords(field(body, "words"));
  if (wordList.length === WORDS_PER_TOPIC) {
    await repo.replaceWords(createDb(c.env.DB), id, wordList);
  }
  return c.redirect(`/topics/${id}`, 303);
});

app.post("/topics/:id/delete", async (c) => {
  await repo.deleteTopic(createDb(c.env.DB), c.req.param("id"));
  return c.redirect("/", 303);
});

app.post("/topics/:id/eval", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const rating = Number(field(body, "rating"));
  if (isValidRating(rating)) {
    await repo.addEvaluation(
      createDb(c.env.DB),
      id,
      field(body, "evaluator").trim() || "human",
      rating,
      field(body, "relation").trim() || null,
    );
  }
  return c.redirect(`/topics/${id}`, 303);
});

app.post("/evaluations/:id/delete", async (c) => {
  await repo.deleteEvaluation(createDb(c.env.DB), Number(c.req.param("id")));
  return c.redirect(c.req.header("referer") ?? "/", 303);
});

export { RoomDO } from "./game/room-do";

export default app;
