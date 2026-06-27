import { Hono } from "hono";
import { api } from "./api";
import { createDb } from "./db";
import * as repo from "./repo";
import { ReviewPage, SetDetailPage, SetsListPage } from "./views";

type Bindings = { DB: D1Database };

const app = new Hono<{ Bindings: Bindings }>();

// 改行・カンマ区切りのテキストを単語配列に。
const parseWords = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

const field = (body: Record<string, string | File>, key: string): string =>
  typeof body[key] === "string" ? body[key] : "";

// sub-agent / プログラム用の JSON API
app.route("/api", api);

// ---- 人間用 Web UI（SSR + フォームPOST）----

app.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const sets = await repo.listSets(db);
  const candidates = await repo.listCandidates(db);
  return c.html(SetsListPage({ sets, candidates })!);
});

app.get("/review", (c) => c.html(ReviewPage({})!));

app.get("/sets/:id", async (c) => {
  const set = await repo.getSet(createDb(c.env.DB), c.req.param("id"));
  return set ? c.html(SetDetailPage({ set })!) : c.notFound();
});

app.post("/sets", async (c) => {
  const body = await c.req.parseBody();
  const wordList = parseWords(field(body, "words"));
  if (wordList.length !== repo.WORDS_PER_TOPIC) return c.redirect("/", 303);
  const id = await repo.createSet(createDb(c.env.DB), wordList);
  return c.redirect(`/sets/${id}`, 303);
});

app.post("/sets/:id/words", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const wordList = parseWords(field(body, "words"));
  if (wordList.length === repo.WORDS_PER_TOPIC) {
    await repo.replaceWords(createDb(c.env.DB), id, wordList);
  }
  return c.redirect(`/sets/${id}`, 303);
});

app.post("/sets/:id/delete", async (c) => {
  await repo.deleteSet(createDb(c.env.DB), c.req.param("id"));
  return c.redirect("/", 303);
});

app.post("/sets/:id/eval", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const source = field(body, "source").trim() || "human";
  const score = Number(field(body, "score"));
  const note = field(body, "note").trim() || null;
  if (Number.isFinite(score)) {
    await repo.upsertEvaluation(createDb(c.env.DB), id, source, score, note);
  }
  return c.redirect(`/sets/${id}`, 303);
});

app.post("/sets/:id/eval/:source/delete", async (c) => {
  const id = c.req.param("id");
  await repo.deleteEvaluation(createDb(c.env.DB), id, c.req.param("source"));
  return c.redirect(`/sets/${id}`, 303);
});

// ---- 候補 ----

app.post("/candidates/:id", async (c) => {
  const body = await c.req.parseBody();
  await repo.updateCandidate(
    createDb(c.env.DB),
    Number(c.req.param("id")),
    parseWords(field(body, "words")),
    field(body, "note").trim() || null,
  );
  return c.redirect("/", 303);
});

app.post("/candidates/:id/register", async (c) => {
  const body = await c.req.parseBody();
  const setId = await repo.registerCandidate(
    createDb(c.env.DB),
    Number(c.req.param("id")),
    parseWords(field(body, "words")),
  );
  return c.redirect(setId ? `/sets/${setId}` : "/", 303);
});

app.post("/candidates/:id/delete", async (c) => {
  await repo.deleteCandidate(createDb(c.env.DB), Number(c.req.param("id")));
  return c.redirect("/", 303);
});

app.post("/candidates/:id/verdict", async (c) => {
  const body = await c.req.parseBody();
  const v = field(body, "verdict");
  // 同じ判定を再度押したら解除（トグル）。呼び出し側が現在値を hidden で渡す。
  const next =
    v === field(body, "current")
      ? null
      : (repo.VERDICT_KEYS as string[]).includes(v)
        ? (v as repo.Verdict)
        : null;
  await repo.setCandidateVerdict(
    createDb(c.env.DB),
    Number(c.req.param("id")),
    next,
  );
  return c.redirect("/", 303);
});

app.post("/candidates/:id/vibe", async (c) => {
  const body = await c.req.parseBody();
  await repo.setCandidateVibe(
    createDb(c.env.DB),
    Number(c.req.param("id")),
    field(body, "current") !== "1", // トグル
  );
  return c.redirect("/", 303);
});

app.post("/candidates/:id/feedback", async (c) => {
  const body = await c.req.parseBody();
  await repo.setCandidateFeedback(
    createDb(c.env.DB),
    Number(c.req.param("id")),
    field(body, "feedback").trim() || null,
  );
  return c.redirect("/", 303);
});

export default app;
