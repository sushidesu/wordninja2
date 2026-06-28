import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// お題。候補も確定も区別せず全部ここ（状態列は持たない）。
// score は evaluations の畳み込み(fold)の materialized 値。誰も直接書かず、
// 評価の増減時に再計算される派生値（ADR 0001）。未評価は null。
export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(), // ランダム採番
  source: text("source"), // 生成元（"gen", "opus46" など）
  score: real("score"), // fold の materialized 値（派生・直接書込み禁止）
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// メンバー語。可変長（語数はアプリ層の設定で縛る）。語ごとに
// word_embeddings 等のパラメータを紐付けられる。
export const words = sqliteTable("words", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
});

// 評価。人・LLM・将来ユーザーの判断記録。唯一の書き込み面（source of truth）。
// verdict はカテゴリ（線形化しない）。score 列は持たない（ADR 0001）。
export const evaluations = sqliteTable("evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: text("topic_id")
    .notNull()
    .references(() => topics.id, { onDelete: "cascade" }),
  evaluator: text("evaluator").notNull(), // "human" | "llm:v4" | "user" ...
  verdict: text("verdict").notNull(), // good/close/too_close/predictable/flat/too_far/nonsense
  reason: text("reason"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// 距離軸の基盤（語×モデルの 1:N）。M2 で活用。
export const wordEmbeddings = sqliteTable(
  "word_embeddings",
  {
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    vector: blob("vector").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.model] })],
);
