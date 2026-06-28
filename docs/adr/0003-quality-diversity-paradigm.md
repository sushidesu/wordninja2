# ADR 0003: お題生成を Quality-Diversity パラダイムへ

- 日付: 2026-06-28
- ステータス: 採用
- 関連: ADR 0001/0002（評価と fold）。本ADRは生成と「良さ」の捉え方を変える。

## 背景・問い

これまでは「単一の良さ基準（ルーブリック）を最適化し、それに合うペアを量産」してきた。問題:
- 1つの基準に収束すると、ユーザーが関係パターンを学習し相手語を予測できる＝ゲームがつまらなくなる。
- 「co-hyponym（共下位語）が良い」と分かったが、co-hyponym ばかりだと「同カテゴリだ」と気づかれ予測可能になる。予測可能性は個々のペアでなく、プール全体の関係タイプの偏りから生じる。
- 「良いペアの理由は複数あるべき」「単語間の関係自体も多様であるべき」。未知の良い関係は事前に列挙できない。

問い: 生成と評価の枠組みをどう設計すれば、「良くて、かつ関係タイプが多様で、未知の良い関係も発見し続ける」プールを育てられるか。

## 決定

Quality-Diversity（QD, MAP-Elites 系）の枠組みを採用する。

- **behavior descriptor（多様性の軸）= 単語間の関係タイプ**（co-hyponym / 共有プロパティ / 機能ペア / 部分-全体 / 因果 / 文化的共起 / 対比 …）。固定列挙せず、開いていて増える。
- **quality = fold スコア**（ADR 0001/0002 のまま）。
- **アーカイブ = 関係タイプごとの区画**。各タイプの良ペアを保持し、多くのタイプを覆う。**1タイプの占有率に上限**を設け、偏り＝予測可能性を構造的に抑える（beyond-accuracy 目的: 多様性・新規性・セレンディピティ・カバレッジ）。
- **2エンジン（探索↔活用）を並走**:
  - 活用 (exploit): 既知の良いタイプを狙い撃ち生成。co-hyponym は taxonomy/embedding で埋める「1つの充填器」に降格（全体ではない）。他の既知タイプも各々の手法で。
  - 探索 (explore): ランダムな語ペアを生成して評価。大半は没だが、稀に未知の良い関係が当たる＝novelty search で新しい区画を発見する装置。
- **評価が関係タイプを記録する**: 高評価ペアに「どの関係で良いか」をラベル（開語彙、後で正規化）。これが descriptor を埋め、関係タイプ taxonomy をボトムアップに育てる。既存タイプに当てはまらない良ペア＝新区画（novelty）。

## 根拠

- QD/MAP-Elites は「1つの最良解」でなく「高品質かつ互いに異なる解の集合」を、behavior descriptor で区画化したアーカイブに保つ。本件は descriptor=関係タイプ、quality=fold で直接当てはまる。LLM 生成へ MAP-Elites を当てた先行（Rainbow Teaming）がある。
- 推薦研究の beyond-accuracy 目的（多様性・新規性・セレンディピティ・カバレッジ）は「精度（=品質）だけ最適化すると価値が頭打ち」を示す。予測可能性の回避＝関係タイプ被覆を明示目的に置く根拠。
- 未知の良い関係は事前列挙できないため、探索（ランダム生成→評価）＝novelty search で発見する。探索↔活用のトレードオフの標準的解。

## 検討した代替案

- 単一ルーブリック最適化（現状）: 収束して予測可能化。却下。
- 純 resource-grounded な co-hyponym 生成のみ: 一タイプ偏重で予測可能。co-hyponym は exploit の一要素に留める。

## 結果

- co-hyponym 生成は継続するが「全体」から「1区画の充填器」へ降格。
- 新規に random explore 生成器（ランダム→評価→新タイプ発見）を持つ。
- 評価に関係タイプのラベルを加える（descriptor）。コックピットに関係タイプ別カバレッジを表示し「次に何を生成すべきか（手薄な区画）」を見えるようにする。
- embedding（M2）は exploit の充填（co-hyponym 抽出・距離帯）に使う。
- 「良さの理由は複数」を、関係タイプ taxonomy として体現する。

## 参考

- MAP-Elites / Quality-Diversity — https://www.emergentmind.com/topics/map-elites-algorithm
- Rainbow Teaming（MAP-Elites を LLM 生成へ） — https://arxiv.org/html/2606.00801
- Diversity, Serendipity, Novelty, Coverage: Beyond-Accuracy Objectives（ACM survey） — https://dl.acm.org/doi/10.1145/2926720
- Novelty search / sparse-reward exploration — https://arxiv.org/pdf/2102.03140
