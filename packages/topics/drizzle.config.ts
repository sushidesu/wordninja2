import { defineConfig } from "drizzle-kit";

// マイグレーション生成専用の設定。
// out は wrangler.jsonc の migrations_dir と一致させ、生成SQLを
// `wrangler d1 migrations apply` でローカル/リモートD1へ適用する。
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
