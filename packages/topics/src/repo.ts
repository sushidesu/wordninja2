import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  topicSetCandidates,
  topicSetEvaluations,
  topicSets,
  words,
} from "./schema";

// ゲームのルール: お題の最小単位はペア（ちょうど2語）。
// 3語・4語は制御が難しいため、2語を土台にし、必要なら 2→3 / 2→4 を合成する。
// 登録済み topic_sets はこの不変条件を満たす（候補=ドラフトは自由）。
export const WORDS_PER_TOPIC = 2;

// お題セットの全体像。UI / API / sub-agent が共有する読み出し単位。
export type Evaluation = {
  source: string;
  score: number;
  note: string | null;
  createdAt: string;
};

export type TopicSetDetail = {
  id: string;
  createdAt: string;
  words: { id: number; text: string }[];
  evaluations: Evaluation[];
};

// 人間評価のスコア。未評価は -1 として末尾に送る。
export const humanScore = (d: TopicSetDetail): number =>
  d.evaluations.find((e) => e.source === "human")?.score ?? -1;

const toEvaluation = (e: typeof topicSetEvaluations.$inferSelect): Evaluation => ({
  source: e.source,
  score: e.score,
  note: e.note,
  createdAt: e.createdAt,
});

export async function listSets(db: Db): Promise<TopicSetDetail[]> {
  const sets = await db.select().from(topicSets);
  const allWords = await db.select().from(words);
  const allEvals = await db.select().from(topicSetEvaluations);

  const details: TopicSetDetail[] = sets.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    words: allWords
      .filter((w) => w.topicSetId === s.id)
      .map((w) => ({ id: w.id, text: w.text })),
    evaluations: allEvals
      .filter((e) => e.topicSetId === s.id)
      .map(toEvaluation),
  }));

  // 良いお題を上に（膨らませる判断用）。未評価は末尾。
  return details.sort((a, b) => humanScore(b) - humanScore(a));
}

export async function getSet(
  db: Db,
  id: string,
): Promise<TopicSetDetail | undefined> {
  const set = await db
    .select()
    .from(topicSets)
    .where(eq(topicSets.id, id))
    .get();
  if (!set) return undefined;

  const ws = await db.select().from(words).where(eq(words.topicSetId, id));
  const es = await db
    .select()
    .from(topicSetEvaluations)
    .where(eq(topicSetEvaluations.topicSetId, id));

  return {
    id: set.id,
    createdAt: set.createdAt,
    words: ws.map((w) => ({ id: w.id, text: w.text })),
    evaluations: es.map(toEvaluation),
  };
}

// ID は意味を持たない。衝突しないランダム値を採番する。
const genId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

async function exists(db: Db, id: string): Promise<boolean> {
  const row = await db
    .select({ id: topicSets.id })
    .from(topicSets)
    .where(eq(topicSets.id, id))
    .get();
  return row !== undefined;
}

// ランダムIDで作成し、採番したIDを返す。
export async function createSet(
  db: Db,
  wordTexts: string[],
): Promise<string> {
  let id = genId();
  while (await exists(db, id)) id = genId();
  await db.insert(topicSets).values({ id });
  if (wordTexts.length > 0) {
    await db
      .insert(words)
      .values(wordTexts.map((text) => ({ topicSetId: id, text })));
  }
  return id;
}

// 語の差し替え。古い語を消すと word_embeddings も cascade で消える
// （語が変われば旧ベクトルは無効、という整合がDBで保たれる）。
export async function replaceWords(
  db: Db,
  id: string,
  wordTexts: string[],
): Promise<void> {
  await db.delete(words).where(eq(words.topicSetId, id));
  if (wordTexts.length > 0) {
    await db
      .insert(words)
      .values(wordTexts.map((text) => ({ topicSetId: id, text })));
  }
}

export async function deleteSet(db: Db, id: string): Promise<void> {
  await db.delete(topicSets).where(eq(topicSets.id, id));
}

export async function upsertEvaluation(
  db: Db,
  topicSetId: string,
  source: string,
  score: number,
  note: string | null,
): Promise<void> {
  await db
    .insert(topicSetEvaluations)
    .values({ topicSetId, source, score, note })
    .onConflictDoUpdate({
      target: [topicSetEvaluations.topicSetId, topicSetEvaluations.source],
      set: { score, note },
    });
}

// ---- 候補（生成→編集→登録/却下）----

export type Verdict = "good" | "close" | "bad";

export type Candidate = {
  id: number;
  words: string[];
  source: string | null;
  note: string | null;
  score: number | null;
  verdict: Verdict | null;
  feedback: string | null;
  createdAt: string;
};

export async function listCandidates(db: Db): Promise<Candidate[]> {
  const rows = await db
    .select()
    .from(topicSetCandidates)
    .orderBy(desc(topicSetCandidates.score), desc(topicSetCandidates.id));
  return rows.map((r) => ({
    id: r.id,
    words: JSON.parse(r.words) as string[],
    source: r.source,
    note: r.note,
    score: r.score,
    verdict: r.verdict as Verdict | null,
    feedback: r.feedback,
    createdAt: r.createdAt,
  }));
}

export async function setCandidateVerdict(
  db: Db,
  id: number,
  verdict: Verdict | null,
): Promise<void> {
  await db
    .update(topicSetCandidates)
    .set({ verdict })
    .where(eq(topicSetCandidates.id, id));
}

export async function setCandidateFeedback(
  db: Db,
  id: number,
  feedback: string | null,
): Promise<void> {
  await db
    .update(topicSetCandidates)
    .set({ feedback })
    .where(eq(topicSetCandidates.id, id));
}

export async function createCandidate(
  db: Db,
  wordTexts: string[],
  source: string | null,
  note: string | null,
  score: number | null,
): Promise<void> {
  await db
    .insert(topicSetCandidates)
    .values({ words: JSON.stringify(wordTexts), source, note, score });
}

export async function updateCandidate(
  db: Db,
  id: number,
  wordTexts: string[],
  note: string | null,
): Promise<void> {
  await db
    .update(topicSetCandidates)
    .set({ words: JSON.stringify(wordTexts), note })
    .where(eq(topicSetCandidates.id, id));
}

export async function deleteCandidate(db: Db, id: number): Promise<void> {
  await db.delete(topicSetCandidates).where(eq(topicSetCandidates.id, id));
}

// 候補を本物のお題へ昇格。成功したら候補を消し、採番したIDを返す。
// 4語でなければ登録せず null を返す（候補は残す）。
export async function registerCandidate(
  db: Db,
  candidateId: number,
  wordTexts: string[],
): Promise<string | null> {
  if (wordTexts.length !== WORDS_PER_TOPIC) return null;
  const id = await createSet(db, wordTexts);
  await deleteCandidate(db, candidateId);
  return id;
}

export async function deleteEvaluation(
  db: Db,
  topicSetId: string,
  source: string,
): Promise<void> {
  await db
    .delete(topicSetEvaluations)
    .where(
      and(
        eq(topicSetEvaluations.topicSetId, topicSetId),
        eq(topicSetEvaluations.source, source),
      ),
    );
}
