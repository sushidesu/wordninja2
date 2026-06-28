import { desc, eq } from "drizzle-orm";
import { FOLD, isAccept, sourceKind, type Verdict } from "./config";
import type { Db } from "./db";
import { evaluations, topics, words } from "./schema";

export type Evaluation = {
  id: number;
  evaluator: string;
  verdict: string;
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

// fold: 信頼度重み付きベイズ集約（Beta-Binomial）で採用確率を出す（ADR 0001）。
// 採用イベント = {good, close} の二値のみ使用。LLMパネルは合計重み上限で按分。
// 未評価は null。
export function foldScore(
  evals: { evaluator: string; verdict: string }[],
): number | null {
  if (evals.length === 0) return null;
  const items = evals.map((e) => {
    const kind = sourceKind(e.evaluator);
    return {
      kind,
      w: FOLD.baseWeight[kind] ?? 0.2,
      acc: isAccept(e.verdict) ? 1 : 0,
    };
  });
  const llmTotal = items
    .filter((i) => i.kind === "llm")
    .reduce((s, i) => s + i.w, 0);
  const llmScale =
    llmTotal > FOLD.llmPanelCap ? FOLD.llmPanelCap / llmTotal : 1;
  let num = FOLD.prior.a0;
  let den = FOLD.prior.a0 + FOLD.prior.b0;
  for (const i of items) {
    const w = i.kind === "llm" ? i.w * llmScale : i.w;
    num += w * i.acc;
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

export async function createTopic(
  db: Db,
  wordTexts: string[],
  source: string | null,
): Promise<string> {
  let id = genId();
  while (await exists(db, id)) id = genId();
  await db.insert(topics).values({ id, source, score: null });
  if (wordTexts.length > 0) {
    await db
      .insert(words)
      .values(wordTexts.map((text) => ({ topicId: id, text })));
  }
  return id;
}

export async function addEvaluation(
  db: Db,
  topicId: string,
  evaluator: string,
  verdict: Verdict,
  reason: string | null,
): Promise<void> {
  await db.insert(evaluations).values({ topicId, evaluator, verdict, reason });
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
        verdict: e.verdict,
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
