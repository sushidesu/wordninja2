import { Hono } from "hono";
import { api } from "./api";
import { VERDICT_KEYS, type Verdict, WORDS_PER_TOPIC } from "./config";
import { createDb } from "./db";
import * as repo from "./repo";
import { ReviewPage, TopicDetailPage, TopicsListPage } from "./views";

type Bindings = { DB: D1Database };

const app = new Hono<{ Bindings: Bindings }>();

const parseWords = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

const field = (body: Record<string, string | File>, key: string): string =>
  typeof body[key] === "string" ? body[key] : "";

app.route("/api", api);

// ---- 人間用 Web UI（SSR + フォームPOST。/review は人間用クライアント）----

app.get("/", async (c) => {
  const topics = await repo.listTopics(createDb(c.env.DB));
  return c.html(TopicsListPage({ topics })!);
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
  const id = await repo.createTopic(createDb(c.env.DB), wordList, "manual");
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
  const verdict = field(body, "verdict");
  if ((VERDICT_KEYS as string[]).includes(verdict)) {
    await repo.addEvaluation(
      createDb(c.env.DB),
      id,
      field(body, "evaluator").trim() || "human",
      verdict as Verdict,
      field(body, "reason").trim() || null,
    );
  }
  return c.redirect(`/topics/${id}`, 303);
});

app.post("/evaluations/:id/delete", async (c) => {
  await repo.deleteEvaluation(createDb(c.env.DB), Number(c.req.param("id")));
  return c.redirect(c.req.header("referer") ?? "/", 303);
});

export default app;
