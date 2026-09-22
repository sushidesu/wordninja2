import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// wrangler がローカルに永続化する D1 の sqlite ファイルを探す。
// ファイル名は DB 名のハッシュなので動的に解決する（metadata.sqlite は除外）。
function findLocalD1(): string | undefined {
  const dir = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  if (!existsSync(dir)) return undefined;
  const file = readdirSync(dir).find(
    (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
  );
  return file ? join(dir, file) : undefined;
}

const localD1 = findLocalD1();

// generate はスキーマと out があれば動く。
// db:studio はローカル D1 ファイルに dbCredentials 経由で接続する。
export default defineConfig({
  schema: "./src/**/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  ...(localD1 ? { dbCredentials: { url: `file:${localD1}` } } : {}),
});
