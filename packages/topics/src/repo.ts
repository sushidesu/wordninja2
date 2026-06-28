import { and, desc, eq, isNull } from "drizzle-orm";
import { FOLD, normalizeRating, sourceKind } from "./config";
import { cosineDistance } from "./distance";
import type { Db } from "./db";
import { evaluations, topics, wordEmbeddings, words } from "./schema";

export type Evaluation = {
  id: number;
  evaluator: string;
  rating: number;
  relation: string | null;
  reason: string | null;
  createdAt: string;
};

export type Topic = {
  id: string;
  source: string | null;
  score: number | null;
  accepted: boolean; // score >= threshold（派生）
  createdAt: string;
  words: { id: number; text: string }[];
  evaluations: Evaluation[];
};

// fold: 信頼度重み付きベイズ平均（star-rating の Bayesian average）（ADR 0002）。
// rating を [0,1] に正規化し、幻の票(κ·m0)で収縮、評価者重みで加重平均。
// LLMパネルは合計重み上限で按分。未評価は null。
export function foldScore(
  evals: { evaluator: string; rating: number }[],
): number | null {
  if (evals.length === 0) return null;
  const items = evals.map((e) => {
    const kind = sourceKind(e.evaluator);
    return {
      kind,
      w: FOLD.baseWeight[kind] ?? 0.2,
      x: normalizeRating(e.rating),
    };
  });
  const llmTotal = items
    .filter((i) => i.kind === "llm")
    .reduce((s, i) => s + i.w, 0);
  const llmScale =
    llmTotal > FOLD.llmPanelCap ? FOLD.llmPanelCap / llmTotal : 1;
  let num = FOLD.phantomVotes * FOLD.priorMean;
  let den = FOLD.phantomVotes;
  for (const i of items) {
    const w = i.kind === "llm" ? i.w * llmScale : i.w;
    num += w * i.x;
    den += w;
  }
  return num / den;
}

const genId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

async function exists(db: Db, id: string): Promise<boolean> {
  const row = await db
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.id, id))
    .get();
  return row !== undefined;
}

// 評価の増減後に topics.score を再計算（materialized fold の維持）。
async function recomputeScore(db: Db, topicId: string): Promise<void> {
  const evs = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.topicId, topicId));
  const score = foldScore(evs);
  await db.update(topics).set({ score }).where(eq(topics.id, topicId));
}

// 作成し、採番した id と挿入した語(id付き)を返す。語 id を返すことで
// 呼び出し側が getTopic を再取得しなくて済む（screen の N+1 回避）。
export async function createTopic(
  db: Db,
  wordTexts: string[],
  source: string | null,
): Promise<{ id: string; words: { id: number; text: string }[] }> {
  let id = genId();
  while (await exists(db, id)) id = genId();
  await db.insert(topics).values({ id, source, score: null });
  let wordRows: { id: number; text: string }[] = [];
  if (wordTexts.length > 0) {
    wordRows = await db
      .insert(words)
      .values(wordTexts.map((text) => ({ topicId: id, text })))
      .returning({ id: words.id, text: words.text });
  }
  return { id, words: wordRows };
}

// 既存お題の「語の集合キー」一覧（重複判定用）。評価を読まない軽量クエリ。
export async function existingWordKeys(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ topicId: words.topicId, text: words.text })
    .from(words);
  const byTopic = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byTopic.get(r.topicId) ?? [];
    arr.push(r.text);
    byTopic.set(r.topicId, arr);
  }
  return new Set(
    [...byTopic.values()].map((ts) => ts.slice().sort().join(" ")),
  );
}

export async function addEvaluation(
  db: Db,
  topicId: string,
  evaluator: string,
  rating: number,
  relation: string | null,
  reason: string | null,
): Promise<void> {
  await db
    .insert(evaluations)
    .values({ topicId, evaluator, rating, relation, reason });
  await recomputeScore(db, topicId);
}

export async function deleteEvaluation(db: Db, id: number): Promise<void> {
  const row = await db
    .select({ topicId: evaluations.topicId })
    .from(evaluations)
    .where(eq(evaluations.id, id))
    .get();
  if (!row) return;
  await db.delete(evaluations).where(eq(evaluations.id, id));
  await recomputeScore(db, row.topicId);
}

export async function replaceWords(
  db: Db,
  topicId: string,
  wordTexts: string[],
): Promise<void> {
  await db.delete(words).where(eq(words.topicId, topicId));
  if (wordTexts.length > 0) {
    await db
      .insert(words)
      .values(wordTexts.map((text) => ({ topicId, text })));
  }
}

export async function deleteTopic(db: Db, id: string): Promise<void> {
  await db.delete(topics).where(eq(topics.id, id));
}

function assemble(
  t: typeof topics.$inferSelect,
  ws: (typeof words.$inferSelect)[],
  evs: (typeof evaluations.$inferSelect)[],
): Topic {
  return {
    id: t.id,
    source: t.source,
    score: t.score,
    accepted: t.score !== null && t.score >= FOLD.threshold,
    createdAt: t.createdAt,
    words: ws
      .filter((w) => w.topicId === t.id)
      .map((w) => ({ id: w.id, text: w.text })),
    evaluations: evs
      .filter((e) => e.topicId === t.id)
      .map((e) => ({
        id: e.id,
        evaluator: e.evaluator,
        rating: e.rating,
        relation: e.relation,
        reason: e.reason,
        createdAt: e.createdAt,
      })),
  };
}

export async function listTopics(db: Db): Promise<Topic[]> {
  const ts = await db.select().from(topics).orderBy(desc(topics.score));
  const ws = await db.select().from(words);
  const evs = await db.select().from(evaluations);
  return ts.map((t) => assemble(t, ws, evs));
}

export type Summary = {
  total: number;
  unrated: number;
  accepted: number;
  rejected: number;
  ratings: Record<number, number>; // human 評点(1..5)ごとの件数
  relations: Record<string, number>; // 採用ペアの関係タイプ別件数（QD カバレッジ）
};

// 一覧結果から集計（純関数）。評点分布と関係タイプ被覆を human 評価から取る。
export function summarize(topics: Topic[]): Summary {
  const ratings: Record<number, number> = {};
  const relations: Record<string, number> = {};
  let unrated = 0;
  let accepted = 0;
  let rejected = 0;
  for (const t of topics) {
    if (t.score === null) unrated++;
    else if (t.accepted) accepted++;
    else rejected++;
    for (const e of t.evaluations) {
      if (e.evaluator === "human") {
        ratings[e.rating] = (ratings[e.rating] ?? 0) + 1;
      }
    }
    // 関係タイプ被覆: 採用ペアごとに1つ（誰のラベルでも可。LLMが付ける）
    if (t.accepted) {
      const rel = t.evaluations.find((e) => e.relation)?.relation;
      if (rel) relations[rel] = (relations[rel] ?? 0) + 1;
    }
  }
  return { total: topics.length, unrated, accepted, rejected, ratings, relations };
}

// ---- 埋め込み（距離軸 M2）----

// ベクトルは JSON text で保存（Workers ランタイムに Node Buffer が無く、
// Drizzle の blob マッパが動かないため）。
const toStored = (vec: number[]): string => JSON.stringify(vec);
const toVector = (stored: string): Float32Array =>
  Float32Array.from(JSON.parse(stored) as number[]);

// まだ指定モデルの埋め込みが無い語。
export async function wordsMissingEmbedding(
  db: Db,
  model: string,
): Promise<{ id: number; text: string }[]> {
  const rows = await db
    .select({ id: words.id, text: words.text })
    .from(words)
    .leftJoin(
      wordEmbeddings,
      and(
        eq(wordEmbeddings.wordId, words.id),
        eq(wordEmbeddings.model, model),
      ),
    )
    .where(isNull(wordEmbeddings.wordId));
  return rows;
}

export async function saveEmbedding(
  db: Db,
  wordId: number,
  model: string,
  dim: number,
  vec: number[],
): Promise<void> {
  await db
    .insert(wordEmbeddings)
    .values({ wordId, model, dim, vector: toStored(vec) })
    .onConflictDoUpdate({
      target: [wordEmbeddings.wordId, wordEmbeddings.model],
      set: { dim, vector: toStored(vec) },
    });
}

// 各 topic のペア距離（2語の語ベクトルのコサイン距離）。両語に埋め込みが
// 揃っている topic のみ返す。
export async function pairDistances(
  db: Db,
  model: string,
): Promise<Map<string, number>> {
  const ws = await db.select().from(words);
  const embs = await db
    .select()
    .from(wordEmbeddings)
    .where(eq(wordEmbeddings.model, model));
  const vec = new Map<number, Float32Array>(
    embs.map((e) => [e.wordId, toVector(e.vector)]),
  );
  const byTopic = new Map<string, Float32Array[]>();
  for (const w of ws) {
    const v = vec.get(w.id);
    if (!v) continue;
    const arr = byTopic.get(w.topicId) ?? [];
    arr.push(v);
    byTopic.set(w.topicId, arr);
  }
  const out = new Map<string, number>();
  for (const [tid, vs] of byTopic) {
    if (vs.length === 2) out.set(tid, cosineDistance(vs[0], vs[1]));
  }
  return out;
}

export async function getTopic(db: Db, id: string): Promise<Topic | undefined> {
  const t = await db.select().from(topics).where(eq(topics.id, id)).get();
  if (!t) return undefined;
  const ws = await db.select().from(words).where(eq(words.topicId, id));
  const evs = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.topicId, id));
  return assemble(t, ws, evs);
}
