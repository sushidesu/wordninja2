import { drizzle } from "drizzle-orm/d1";

// D1 への接続だけを担う中立なインフラ。スキーマは各モジュール(topics/schema.ts など)が
// 所有する。drizzle への schema 引き渡しは relational query API 用で、ここでは
// select/insert 系のコア API しか使わないため不要。渡すと db が特定モジュールに依存する。
export const createDb = (d1: D1Database) => drizzle(d1);

export type Db = ReturnType<typeof createDb>;
