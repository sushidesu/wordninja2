import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// お題セット。id は呼び出し側(Claude)が指定する。
export const topicSets = sqliteTable("topic_sets", {
  id: text("id").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// セットを構成する単語。セット専有（単語の共有・重複排除はしない）。
export const words = sqliteTable("words", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicSetId: text("topic_set_id")
    .notNull()
    .references(() => topicSets.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
});

// 距離軸の基盤: 単語×モデルの 1:N。
// 距離はベクトルが同一空間でなければ無意味なので model/dim を契約として必ず持つ。
// 距離・距離由来の指標は保存せず純関数で派生する（状態を増やさない）。
export const wordEmbeddings = sqliteTable(
  "word_embeddings",
  {
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dim: integer("dim").notNull(),
    vector: blob("vector").notNull(), // Float32Array のバイト列
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.model] })],
);

// 生成された候補（未登録）。topic_sets とは別ライフサイクル
// （生成→編集→登録/却下）。登録時に topic_sets へ昇格し、候補は消える。
// 編集前提の一時データなので words は JSON 配列で軽量に持つ。
export const topicSetCandidates = sqliteTable("topic_set_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  words: text("words").notNull(), // JSON: string[]
  source: text("source"), // 生成元（agent/プロンプト名など）
  note: text("note"), // 生成理由 / ルーブリック採点の内訳
  score: real("score"), // ルーブリック自動評価の予測スコア（0.0〜1.0, 未採点は null）
  verdict: text("verdict"), // 人の判定: "good" | "close" | "bad" | null
  feedback: text("feedback"), // 人の自由コメント（膨張ループの入力）
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// 評価軸: お題セット×評価者の 1:N。距離とは独立した別軸。
export const topicSetEvaluations = sqliteTable(
  "topic_set_evaluations",
  {
    topicSetId: text("topic_set_id")
      .notNull()
      .references(() => topicSets.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 評価者/基準 ("human" / "claude" / ...)
    score: real("score").notNull(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.topicSetId, t.source] })],
);
