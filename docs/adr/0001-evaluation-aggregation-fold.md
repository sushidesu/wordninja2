# ADR 0001: お題評価の集約（fold）方式

- 日付: 2026-06-28
- ステータス: 採用
- 関連: docs/odai-rubric-v4.md（評価観点の中身）

## 背景・問い

お題の品質を表す `score` を、何から・どう導くか。

前提（このプロジェクトで確定済みの設計）:
- 評価の真実は `evaluations`（誰が・どの verdict・理由）であり、`score` はその畳み込み。書き込み面は `evaluations` のみ、`score` は誰も直接書かない。
- 評価者は異質で増えていく: 専門家（人）、LLM 評価器（複数）、将来はユーザー（アンケート/インタビュー/統計）。
- verdict はカテゴリ（good / close / too_close / predictable / flat / too_far / nonsense）で、一直線に並ばない。
- 早期は1お題あたりの評価数が少ない。ソースごとに信頼度が違う。人も誤る。

問い: これらノイズのあるカテゴリ評価を、複数の異質ソースから集約して1つの `score` にする fold の規則を何にするか。

## 決定

信頼度重み付きベイズ集約（Beta–Binomial）で「採用に値する確率」を `score` とする。

```
score = (a0 + Σ_s w_s · accept_s) / (a0 + b0 + Σ_s w_s)
```

- `accept_s` = 各評価の二値。verdict ∈ {good, close} なら 1、それ以外は 0。
- `w_s` = ソース信頼度の重み。人 > LLM > ユーザー、すべて > 0。
- LLM パネルは合計重みに上限を設ける（実効票割引）。
- `(a0, b0)` = Beta 事前分布。少数サンプルを事前平均へ収縮させる。
- 採用判定は `score ≥ τ`（閾値）。
- `w_s`・`a0`・`b0`・`τ` は設定値として外出しし、後から調整可能にする。

初期値: `w_human = 1.0`、LLM パネル合計 ≤ 0.6、`Beta(1, 1)`、`τ = 0.5`。

付随する確定事項:
- verdict → score の線形マッピングは採用しない。集約に使うのは「採用イベントか否か」の二値のみ。
- 5つの却下理由（too_close / predictable / flat / too_far / nonsense）は nominal なメタデータとして `evaluations` に保持し、`score` の計算には使わない（校正と生成にのみ使う）。
- `evaluations` に per-evaluation の score 列は持たない。LLM の rubric 内部値は `reason` に残す程度。
- `topics.score` は上式の materialized 値。`evaluations` の増減時に再計算する。

## 根拠

- カテゴリ評価は線形化しないのが定石。Dawid–Skene / GLAD / MACE 系の潜在真値モデルは、評価者ごとの誤り傾向をモデル化してカテゴリラベルを直接集約し、真値の事後確率を出す。verdict を数値軸に並べる必要がない。本決定は「採用イベントの二値＋事前収縮」という、その枠組みの軽量版にあたる。
- LLM 評価パネルは誤りが相関する（同一バイアスを共有）ため、数を増やしても独立情報は増えない。"Nine Judges, Two Effective Votes" は9体でも実効2票と報告。よって LLM をゼロにはしないが、パネル合計重みに上限を設けて人の独立票を埋もれさせない。
- 人と機械の統合は信頼度重み付けが有効（confidence-weighted integration）。少数サンプルはベイズ収縮で安定化する。
- ユーザー評価（アンケート等）は「採用イベント」の自然な観測であり、新ソースを `w_user` で足すだけで同じ式に合流できる。

## 検討した代替案

- 多数決（majority vote）: LLM の相関誤差下では実効票が増えず、人の少数だが独立な票を機械の多数が押し流す。却下。
- 人の評価で上書き（human-override）: LLM 評価が無意味化する。人も誤るため単一票依存は脆い。却下。
- verdict → score の線形マッピング: verdict は一直線に並ばない。却下。
- 最初から Dawid–Skene / MACE / CARE: 評価者の混同行列を学習するにはデータ量が要り、早期は不安定。将来の上位互換として保留。

## 結果

- 重み・事前・閾値が config 化され、運用しながら調整できる。
- データが貯まれば、手設定の重みを Dawid–Skene / MACE で学習した信頼度に、判定者間相関を CARE で、と同じ枠組みのまま差し替えられる。
- `score` の計算に却下理由を使わないため、理由分布はルーブリック校正・生成方針の入力として独立に扱える。
- 初期重みは経験的に設定するため、人評価との整合を見て更新が要る。

## 参考

- Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels — https://arxiv.org/html/2605.29800
- CARE: Confounder-Aware Aggregation for Reliable LLM Evaluation — https://arxiv.org/pdf/2603.00039
- Confidence-weighted integration of human and machine judgments — https://arxiv.org/html/2408.08083v3
- LLMs-as-Judges: A Comprehensive Survey on LLM-based Evaluation Methods — https://arxiv.org/pdf/2412.05579
- Dawid & Skene (1979), Maximum Likelihood Estimation of Observer Error-Rates Using the EM Algorithm
