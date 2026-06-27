import { Hono } from "hono";
import { createDb } from "./db";
import * as repo from "./repo";

type Bindings = { DB: D1Database };

// sub-agent（生成・膨張・自動評価）と UI が共有する JSON 操作面。
export const api = new Hono<{ Bindings: Bindings }>();

api.get("/sets", async (c) => c.json(await repo.listSets(createDb(c.env.DB))));

api.get("/sets/:id", async (c) => {
  const set = await repo.getSet(createDb(c.env.DB), c.req.param("id"));
  return set ? c.json(set) : c.json({ error: "not found" }, 404);
});

api.post("/sets", async (c) => {
  const { words } = await c.req.json<{ words?: string[] }>();
  const wordList = words ?? [];
  if (wordList.length !== repo.WORDS_PER_TOPIC) {
    return c.json({ error: `words must be exactly ${repo.WORDS_PER_TOPIC}` }, 400);
  }
  const id = await repo.createSet(createDb(c.env.DB), wordList);
  return c.json({ ok: true, id }, 201);
});

api.put("/sets/:id/words", async (c) => {
  const { words } = await c.req.json<{ words: string[] }>();
  const wordList = words ?? [];
  if (wordList.length !== repo.WORDS_PER_TOPIC) {
    return c.json({ error: `words must be exactly ${repo.WORDS_PER_TOPIC}` }, 400);
  }
  await repo.replaceWords(createDb(c.env.DB), c.req.param("id"), wordList);
  return c.json({ ok: true });
});

api.delete("/sets/:id", async (c) => {
  await repo.deleteSet(createDb(c.env.DB), c.req.param("id"));
  return c.json({ ok: true });
});

api.put("/sets/:id/evaluations", async (c) => {
  const { source, score, note } = await c.req.json<{
    source: string;
    score: number;
    note?: string | null;
  }>();
  await repo.upsertEvaluation(
    createDb(c.env.DB),
    c.req.param("id"),
    source,
    score,
    note ?? null,
  );
  return c.json({ ok: true });
});

// 候補: sub-agent が生成結果を投入する口。1件 or 配列をまとめて受ける。
api.post("/candidates", async (c) => {
  type Item = {
    words: string[];
    source?: string;
    note?: string;
    score?: number;
  };
  const body = await c.req.json<Item | { candidates: Item[] }>();
  const items = "candidates" in body ? body.candidates : [body];
  const db = createDb(c.env.DB);
  for (const item of items) {
    await repo.createCandidate(
      db,
      item.words,
      item.source ?? "claude",
      item.note ?? null,
      item.score ?? null,
    );
  }
  return c.json({ ok: true, created: items.length }, 201);
});

api.get("/candidates", async (c) =>
  c.json(await repo.listCandidates(createDb(c.env.DB))),
);

// 判定 / フィードバックの設定（人 or sub-agent）
api.put("/candidates/:id/feedback", async (c) => {
  const { verdict, feedback } = await c.req.json<{
    verdict?: repo.Verdict | null;
    feedback?: string | null;
  }>();
  const db = createDb(c.env.DB);
  const id = Number(c.req.param("id"));
  if (verdict !== undefined) await repo.setCandidateVerdict(db, id, verdict);
  if (feedback !== undefined) await repo.setCandidateFeedback(db, id, feedback);
  return c.json({ ok: true });
});

api.delete("/sets/:id/evaluations/:source", async (c) => {
  await repo.deleteEvaluation(
    createDb(c.env.DB),
    c.req.param("id"),
    c.req.param("source"),
  );
  return c.json({ ok: true });
});
