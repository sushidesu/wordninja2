# ADR 0002: 評価を5段階評点に変更（verdict カテゴリの廃止）

- 日付: 2026-06-28
- ステータス: 採用
- 関連: ADR 0001（fold の枠組み。本ADRは評価の表現と fold の入力を更新する）

## 背景・問い

評価を、将来エンドユーザー（アンケート/インタビュー）にも使ってもらう前提で見直す。

旧構成は7カテゴリの verdict（good/close ＋ 却下理由 too_close/predictable/flat/too_far/nonsense）。問題:
- 却下理由は一直線に並ばない（線形尺度にできない）。一方「品質の良し悪し」は単極で順序づく。両者が1つの verdict に混在していた。
- 却下理由の語彙はユーザー向けには複雑すぎる。

問い: 評価の表現を何にするか。

## 決定

評価を「5段階の品質評点（単極 1..5）＋ 任意の自由コメント」にする。

- `evaluations.verdict`（カテゴリ）を廃止し、`evaluations.rating`（整数 1..5）に置き換える。
- ラベル: 1 悪い / 2 いまいち / 3 ふつう / 4 良い / 5 とても良い。
- 理由は `evaluations.reason`（任意の自由文）。旧却下理由（近すぎ/予測可能/平凡/遠すぎ/意味不明）は、コメント欄への**入力補助プリセット**としてだけ残す（クリックで自由文に挿入。集約には使わない）。
- fold（ADR 0001）の入力を二値の採用イベントから正規化評点へ変更:
  `score = (κ·m0 + Σ_s w_s·x_s) / (κ + Σ_s w_s)`、`x_s = (rating - 1) / 4`。
  これは star-rating の Bayesian average（幻の票 κ·m0 で収縮）。重み `w_s`・LLMパネル上限・閾値 `τ` は ADR 0001 のまま。
- 採用は `score ≥ τ`（派生、調整可能）。

設定値（`src/config.ts`、調整可能）: `baseWeight {human:1.0, llm:0.3, user:0.2}`、`llmPanelCap 0.6`、`priorMean 0.5`、`phantomVotes 1`、`threshold 0.55`。

## 根拠

- 品質評価は単極（低→高）。単極尺度は5点が最適という報告（Krosnick）。Likert の最適範囲は4〜7点で、7点超は精度向上が頭打ち。単純さとユーザー適合を取り5点とする。
- 順序評点の集約は star-rating の Bayesian average が定番（少数サンプルを幻の票で事前平均へ収縮、評価者の信頼度で加重）。ADR 0001 の枠組みと地続きで、二値 → [0,1] 正規化評点に置き換えるだけで成立する。
- 「verdict は線形でない」という ADR 0001 の前提は、線形でない却下理由を評価の主軸から外したことで解消した。残る品質評点は順序尺度として平均してよい。

## 検討した代替案

- 7カテゴリ verdict を維持: ユーザーには複雑。却下理由が線形でないまま score 化が難しい。却下。
- 7段階尺度: 単極では5点で十分（7点は双極向け）。却下。
- 理由を構造化フィールドとして残す: 校正の構造性は上がるが、ユーザー向けの単純さを損なう。任意コメント＋プリセット補助に留める。

## 結果

- 評価面が「★1〜5 ＋ 任意コメント」に単純化。/review は 1〜5 キー、コックピットは評点分布表示。
- 却下理由の分布シグナルが構造データから自由文へ移り、ルーブリック校正は低評点コメントを読む運用になる（構造性は下がる）。生成器の仕様（rubric v4）は別途残る。
- 既存46ラベルは good→★5 / close→★4 / 却下→★2（理由を reason に保持）で移行。

## 参考

- How many response categories are sufficient for Likert-type scales（4〜7が最適） — https://files.eric.ed.gov/fulltext/EJ1359497.pdf
- Likert Scale Design: 5-Point vs 7-Point — https://lensym.com/blog/likert-scale-design-guide
- Bayesian Average Rating（幻の票による収縮） — https://vault.asgard-ai.com/skills/skill-algo-rank-bayesian/
- k-Rater Reliability: aggregated annotations — https://arxiv.org/pdf/2203.12913
