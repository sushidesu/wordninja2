# @wordninja/testplay

ワードニンジャのお題ペアを2エージェントにテストプレイさせ、進行と「なぜそう動いたか」を
事実ログ(`logs/<logLabel>/game-*.json` + `summary.json`)として残す独立ハーネス。

LLM 呼び出しは `claude -p --json-schema`(ヘッドレス Claude Code)。サブスクリプション認証を
そのまま使い、構造化出力はサーバ側で強制、コール毎の usage(トークン)をログに残す。

## 使い方

```sh
# JSON 文字列を直接
pnpm --filter @wordninja/testplay play '{"logLabel":"2026-07-03-soba","pair":["そば","うどん"],"repeat":3,"models":{"1":"opus","2":"opus"}}'

# ファイルから
pnpm --filter @wordninja/testplay play runs/soba.json
```

入力 contract は `src/types.ts` の `Input`(旧 workflow 版と同形):

- `logLabel` ★必須。`logs/<logLabel>/` に保存
- `runs` / `pairs` / `pair` のいずれか必須(フォールバック既定お題なし)
- `repeat` 並列リプレイ数(既定1)、`models` / `playModes` プレイヤー別指定
- `answererModel` oracle のモデル(既定 sonnet)、`maxTurnsPerPlayer`(既定20)
- `maxConcurrency` claude プロセスの同時上限(既定8)
- `effort` 全コールの思考量(`low`〜`max`。未指定は CLI 既定)

## 再実行 = レジューム

同じ `logLabel` で再実行すると、完了済みの game ファイルはスキップされ欠けだけ実行される
(summary は全ゲームから再構築)。ゲームが失敗しても同じコマンドをもう一度流せばよい。

## サブスクの使用量ウィンドウ

長い opus バッチでは使用量ウィンドウに当たり、`claude -p` が内部バックオフで固まることがある。
コールは 600s タイムアウト + クールダウン付き再試行(0/60s/300s)で乗り切るが、
それでも落ちたゲームは上のレジュームで回収する。

## 観測ログに残るもの

`src/types.ts` が契約。ゲームごとに:

- transcript: 質問/推測に加え **oracle の吟味(answerReasoning)・採用質問への予想回答(predictions)・
  回答反映後の事後(beliefAfter)・候補質問と EIG** を残す
- metrics: 正解語が支持集合に入ったターン・追い出し回数・最終確率/順位(収束の観測)
- cost: 実トークン・コール数(thinker/oracle 別)

summary.json には解決/引分・語別成績に加えて **config(モデル・しきい値・尤度定数)** を記録し、
run 間比較の前提を担保する。

## 構成

- `src/llm.ts` — claude -p クライアント(セマフォ・リトライ・usage 回収)
- `src/engine/belief.ts` — 信念(ベイズ更新・EIG)。純関数
- `src/engine/thinker.ts` — 質問者(externalized / light)
- `src/engine/oracle.ts` — 回答役(実体プロファイル・回答・推測判定)
- `src/engine/game.ts` — 1ゲームの進行と transcript
- `src/engine/run.ts` — 並列実行・プロファイル共有・集計
