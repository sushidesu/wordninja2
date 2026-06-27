# お題データベース 設計 (Topics DB)

- 日付: 2026-06-27
- 対象パッケージ: `packages/topics` (`@wordninja/topics`)
- ステータス: 合意済み（M1 着手）

## 背景

ワードニンジャ（ボードゲーム）のスマホアプリ化プロジェクト。お題（似ているが区別できる単語の集合）を管理し、将来的に「お題/単語どうしの距離」と「お題の良し悪し（評価）」を測る仕組みを作りたい。

旧構成（`packages/server` の Hono+D1 に管理APIを同居、`packages/admin` の Vite+React 管理SPA、`packages/shared` の共有型）は破棄する。mobile は温存（`@wordninja/shared` を import も API 呼び出しもしておらず、依存宣言の1行を外せば壊れない）。

## ゴール

お題を保管し **Claude（等）が CRUD できる** データ層を、Cloudflare Workers + D1 + Drizzle で 1 パッケージとして用意する。スキーマは将来の「距離評価」「お題評価」を支えるパラメータを持てる形にする。

## スコープ

### M1（今回）
パッケージ作成 → D1 作成 → Drizzle 導入 → スキーマ定義 → マイグレーション生成・適用 → Claude が CRUD できる状態。

### M2 以降（今回やらない）
- embedding 生成（Workers AI `@cf/baai/bge-m3` 想定）と距離/評価の純関数（`distance.ts`）
- MCP サーバー（`@hono/mcp`）で CRUD と評価をツール化
- mobile 向け配信 API

## 技術選定

- **Hono + Cloudflare Workers + D1**: 「全部 Hono で」。配信・管理・将来の MCP を同一 Hono アプリに集約できる。
- **Drizzle ORM + drizzle-kit**: 2026 時点で D1 のライブラリは Drizzle が事実上の標準。D1 ファーストクラス対応（preview/proxy 不要）、~7.4kb でコールドスタートにほぼ影響なし、スキーマを TypeScript で定義＝型と DB 構造の単一の真実の源、`drizzle-kit` に generate/migrate/push/studio。Prisma は Workers/edge が今も Preview で WASM コンパイル問題あり地雷、Kysely はマイグレーション機構なし。
  - 参考: orm.drizzle.team/docs/connect-cloudflare-d1, pkgpulse.com の 2026 ORM 比較

## 設計判断と根拠

### 2 軸モデル: 距離軸 と 評価軸 は独立
- **距離軸**: 単語の embedding ベクトルを生データとして持ち、距離（単語間・セット間）と距離由来の指標は**保存せず純関数で派生**する。状態を増やさない。
- **評価軸**: お題の良し悪しは距離だけでは決まらない（面白さ・公平さ・難易度など）。距離の派生に畳み込まず、**評価それ自体を独立に保存**する。
- 距離 7-a の単位は **単語どうし・お題セットどうしの両方**（セット間は構成単語ベクトルの重心間距離で派生）。

### embedding は単語×モデルの 1:N
- 「どの embedding モデルが良い距離を出すか」を比較したくなるため、1 単語に複数モデルのベクトルを併存させる。単一カラムだとモデル切替が破壊的になる。
- 距離はベクトルが**同一空間**でなければ無意味なので、各ベクトルに `model` と `dim` を必ず持たせる（壊れない契約）。距離計算は常に単一モデルで絞る。

### 評価も複数ソースの 1:N
- 人手・Claude・別 LLM・評価基準ごとに、上書きせず並べて持つ（embedding と一貫）。粒度は**お題セット単位**（「お題の良し悪し」＝セット）。

### ベクトルは D1 に格納
- データ規模は小さく、JS でコサイン距離を計算すれば十分速い。お題もベクトルも 1 つの DB ＝単一の真実の源で、Claude の CRUD 面も 1 つで済む。Vectorize は規模が必要になってからの将来オプション。

### お題評価の考え方（M2 で実装、ここでは方針のみ）
良いお題＝互いに似ているが区別できる。セット内ペアのコサイン距離分布が目標帯 `[d_low, d_high]` に収まり、ばらつきが小さいほど良い（近すぎ＝同義で理不尽、遠すぎ＝簡単すぎ）。ただし「良い帯」は校正が必要なハイパーパラメータ。当初は直感で設定・調整し、将来は保存した評価軸データで校正できる（依存はさせない）。

### スコープ外（今回入れない）
- `theme` 列、特徴属性（品詞/カテゴリ）、計算済み距離/スコアの保存、プレイ記録、配信 API、管理 UI。

## スキーマ（＝設計の契約）

```
topic_sets
  id          text PK                         -- 呼び出し側(Claude)が指定
  created_at  text NOT NULL default now

words
  id            integer PK autoincrement      -- セット内部用（Claudeはセット単位で扱う）
  topic_set_id  text    NOT NULL FK -> topic_sets(id) ON DELETE CASCADE
  text          text    NOT NULL

-- 距離軸の基盤（単語×モデルの 1:N）
word_embeddings
  word_id    integer NOT NULL FK -> words(id) ON DELETE CASCADE
  model      text    NOT NULL                 -- embedding 空間の同一性（契約）
  dim        integer NOT NULL                 -- ベクトル長（破損検出）
  vector     blob    NOT NULL                 -- Float32Array のバイト列
  created_at text    NOT NULL default now
  PRIMARY KEY (word_id, model)

-- 評価軸（お題セット×評価者の 1:N、距離とは独立）
topic_set_evaluations
  topic_set_id text NOT NULL FK -> topic_sets(id) ON DELETE CASCADE
  source       text NOT NULL                  -- 評価者/基準 ("human"/"claude"/"gpt-..." 等)
  score        real NOT NULL                  -- 評価値
  note         text NULL                      -- 任意: 評価理由
  created_at   text NOT NULL default now
  PRIMARY KEY (topic_set_id, source)
```

制約の置き場所: 「1 セットは最低 2 語」などの可変長制約は DB の CHECK ではなくアプリ層で扱う。

## パッケージ構成（M1）

```
packages/topics/
  package.json
  tsconfig.json
  wrangler.jsonc          -- D1 バインディング
  drizzle.config.ts       -- dialect: sqlite / driver: d1
  drizzle/                -- 生成マイグレーション
  src/
    schema.ts             -- 上記スキーマ（Drizzle、唯一の真実の源）
    db.ts                 -- drizzle(d1) ファクトリ
    index.ts              -- Hono エントリ（今は最小）
```

mobile 側: `packages/mobile/package.json` から `@wordninja/shared` 依存の 1 行を削除。

## Claude が CRUD する手段

- **M1**: ローカル D1 を立て、Claude は `wrangler d1 execute`（生 SQL）／`drizzle-kit studio`（GUI）／db+schema を使う小スクリプトで CRUD する。受け入れ条件「Claude が CRUD できる」を満たす。
- **M2 以降**: 同じ Hono アプリに MCP サーバーを被せ、CRUD と評価をツール化。

## マイルストーン

- **M1**: パッケージ + D1 + Drizzle + スキーマ + マイグレーション + Claude が CRUD できる状態。
- **M2**: embedding 生成 + 距離/評価の純関数。
- **M3**: MCP（or REST）でツール化、配信 API。
