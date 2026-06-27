# font-lab — フォント組み合わせの学習＆生成

フォント選定を反復で改善するためのツール一式。アプリ本体ではなく開発用。

## ループ

1. アプリの **フォントプレビュー画面**（起動画面右上「Aa フォント」）で番号付き候補12種を見る。
2. 良かった番号を伝える（例「3, 7, 11」）。
3. 次を実行 → スコア更新＋次バッチ生成：
   ```
   node packages/mobile/font-lab/generate.mjs --liked 3,7,11
   ```
4. アプリをリロードすると新しい候補が出る。2 に戻る。

良いものが無かったラウンドは `--liked` 無しで実行すれば、全枠をハズレ扱いにして次へ進む。

## 仕組み

- 組み合わせ単位ではなく **フォント1つ1つの好まれ度** を学習する。各フォントの評価を
  Beta 分布で持ち、**Thompson sampling** でスコアをサンプリングして並べる。
  これで「学習で良い display × 良い body」を選びつつ (exploit)、評価の浅いフォントも
  たまに高く出て探索される (explore)。さらに純ランダム枠で未知の組み合わせを必ず混ぜる。
- 1バッチ = `ANCHOR`(過去の高評価を再掲) + `LEARNED`(学習で上位) + `RANDOM`(純ランダム)。
  同一フォントへの偏りは `MAX_PER_DISPLAY` / `MAX_PER_BODY` で抑え、見比べの多様性を担保する。
- 構成パラメータは `generate.mjs` 冒頭の定数で調整できる。

## ファイル

- `pool.json` — 候補フォントプール（探索空間）。単一情報源。キーは
  `src/constants/font-catalog.ts` の `fontAssets` と一致させる。プールを増やすときは
  両方に追加し、対応する `@expo-google-fonts/*` をインストールする。
- `feedback.json` — 学習状態（各フォントの shown/liked・高評価履歴・現バッチ）。自動更新。
  最初からやり直したいときは削除する。
- `generate.mjs` — 学習＆生成スクリプト。
- 出力 → `src/constants/font-pairings.generated.ts`（アプリが読む。直接編集しない）。

## 選定が決まったら

選んだペアの `display` / `body` / `bodyBold` の値を `src/constants/theme.ts` の `Fonts` に移す。
その後 font-lab 一式・プレビュー画面・起動画面のボタン・未使用フォントは削除してよい。
