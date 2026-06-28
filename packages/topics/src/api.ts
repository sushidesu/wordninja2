import { Hono } from "hono";
import { isValidRating, WORDS_PER_TOPIC } from "./config";
import { createDb } from "./db";
import * as repo from "./repo";

type Bindings = { DB: D1Database };

// LLM・スクリプト・/review が共有する JSON 操作面。
export const api = new Hono<{ Bindings: Bindings }>();

api.get("/topics", async (c) => c.json(await repo.listTopics(createDb(c.env.DB))));

api.get("/topics/:id", async (c) => {
  const t = await repo.getTopic(createDb(c.env.DB), c.req.param("id"));
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

// 生成: 1件 or 配列をまとめて投入（未評価で入る）。
api.post("/topics", async (c) => {
  type Item = { words: string[]; source?: string };
  const body = await c.req.json<Item | { topics: Item[] }>();
  const items = "topics" in body ? body.topics : [body];
  const db = createDb(c.env.DB);
  const ids: string[] = [];
  for (const it of items) {
    if ((it.words ?? []).length !== WORDS_PER_TOPIC) {
      return c.json(
        { error: `words must be exactly ${WORDS_PER_TOPIC}` },
        400,
      );
    }
    ids.push(await repo.createTopic(db, it.words, it.source ?? null));
  }
  return c.json({ ok: true, ids }, 201);
});

api.put("/topics/:id/words", async (c) => {
  const { words } = await c.req.json<{ words: string[] }>();
  if ((words ?? []).length !== WORDS_PER_TOPIC) {
    return c.json({ error: `words must be exactly ${WORDS_PER_TOPIC}` }, 400);
  }
  await repo.replaceWords(createDb(c.env.DB), c.req.param("id"), words);
  return c.json({ ok: true });
});

api.delete("/topics/:id", async (c) => {
  await repo.deleteTopic(createDb(c.env.DB), c.req.param("id"));
  return c.json({ ok: true });
});

// 評価の投入（人・LLM共通）。1件 or 配列。score は自動再計算。
api.post("/evaluations", async (c) => {
  type Item = {
    topicId: string;
    evaluator: string;
    rating: number;
    reason?: string;
  };
  const body = await c.req.json<Item | { evaluations: Item[] }>();
  const items = "evaluations" in body ? body.evaluations : [body];
  const db = createDb(c.env.DB);
  for (const it of items) {
    if (!isValidRating(it.rating)) {
      return c.json({ error: `rating must be 1..5: ${it.rating}` }, 400);
    }
    await repo.addEvaluation(
      db,
      it.topicId,
      it.evaluator,
      it.rating,
      it.reason ?? null,
    );
  }
  return c.json({ ok: true, count: items.length }, 201);
});

api.delete("/evaluations/:id", async (c) => {
  await repo.deleteEvaluation(createDb(c.env.DB), Number(c.req.param("id")));
  return c.json({ ok: true });
});
