import { Hono } from "hono";
import { embedTexts } from "./ai";
import {
  EMBED_DIM,
  EMBED_MODEL,
  isValidRating,
  NEAR_THRESHOLD,
  WORDS_PER_TOPIC,
} from "./config";
import { createDb } from "./db";
import { cosineDistance } from "./distance";
import * as repo from "./repo";

type Bindings = { DB: D1Database; AI: Ai };

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
    ids.push((await repo.createTopic(db, it.words, it.source ?? null)).id);
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
    relation?: string;
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
      it.relation ?? null,
    );
  }
  return c.json({ ok: true, count: items.length }, 201);
});

// 採用プールの集計（関係タイプ被覆を含む）。校正ループが生成を逸らすのに使う。
api.get("/coverage", async (c) =>
  c.json(repo.summarize(await repo.listTopics(createDb(c.env.DB)))),
);

api.delete("/evaluations/:id", async (c) => {
  await repo.deleteEvaluation(createDb(c.env.DB), Number(c.req.param("id")));
  return c.json({ ok: true });
});

// ---- 埋め込み / 距離（M2）----

// 未埋め込みの語を Workers AI でベクトル化して保存（増分バックフィル）。
api.post("/embed", async (c) => {
  const db = createDb(c.env.DB);
  const missing = await repo.wordsMissingEmbedding(db, EMBED_MODEL);
  let done = 0;
  const CHUNK = 50;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK);
    const vecs = await embedTexts(c.env.AI, batch.map((w) => w.text));
    for (let j = 0; j < batch.length; j++) {
      await repo.saveEmbedding(db, batch[j].id, EMBED_MODEL, EMBED_DIM, vecs[j]);
      done++;
    }
  }
  return c.json({ ok: true, embedded: done, model: EMBED_MODEL });
});

// 各 topic のペア距離（コサイン距離）一覧。距離と人評価の相関確認用。
api.get("/distances", async (c) => {
  const dists = await repo.pairDistances(createDb(c.env.DB), EMBED_MODEL);
  return c.json(Object.fromEntries(dists));
});

// 生成ファネルのスクリーニング: 生成ペアを embed し、既存重複と「近すぎ」を
// 自動排除して、通過分だけ未評価 topic として投入（embedding も保存）。
// 人は通過候補だけを /review すればよい。
api.post("/screen", async (c) => {
  const { pairs } = await c.req.json<{ pairs: string[][] }>();
  const db = createDb(c.env.DB);
  const existing = await repo.existingWordKeys(db);
  // 全語をまとめて embed（重複語は1回）
  const uniq = [...new Set(pairs.flat())];
  const vecs = await embedTexts(c.env.AI, uniq);
  const vmap = new Map<string, number[]>(uniq.map((w, i) => [w, vecs[i]]));

  const kept: { words: string[]; distance: number; id: string }[] = [];
  const near: { words: string[]; distance: number }[] = [];
  const dup: string[][] = [];
  for (const words of pairs) {
    const key = [...words].sort().join(" ");
    if (existing.has(key) || words.length !== WORDS_PER_TOPIC) {
      dup.push(words);
      continue;
    }
    const d = cosineDistance(
      Float32Array.from(vmap.get(words[0]) ?? []),
      Float32Array.from(vmap.get(words[1]) ?? []),
    );
    if (d < NEAR_THRESHOLD) {
      near.push({ words, distance: d });
      continue;
    }
    const t = await repo.createTopic(db, words, "gen-screened");
    for (let i = 0; i < t.words.length; i++) {
      await repo.saveEmbedding(
        db,
        t.words[i].id,
        EMBED_MODEL,
        EMBED_DIM,
        vmap.get(t.words[i].text) ?? [],
      );
    }
    existing.add(key);
    kept.push({ words, distance: d, id: t.id });
  }
  return c.json({ kept, near, dup });
});
