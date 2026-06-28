# お題 生成→評価ループ 全体像

現在の生成・評価フロー（Quality-Diversity, ADR 0001/0002/0003）。

```mermaid
flowchart TB
  subgraph GEN["① 生成（Claude が sub-agent で実行）"]
    direction TB
    MODE{"モード選択<br/>(活用↔探索のバランス)"}

    subgraph EXPLOIT["exploit: 良い関係タイプ(セル)を深掘り"]
      direction TB
      PICK["a. 狙う関係タイプを1つ選ぶ<br/>(被覆が手薄 or 実績ある型)<br/>例: 対比 / co-hyponym / 同役割異領域"]
      ELITE["b. その型の採用例=お手本(elites)<br/>を few-shot にする"]
      CONS["c. 制約を付ける<br/>・既存ペア → 除外<br/>・却下の失敗型 → 回避<br/>(機能アナロジー/自明/近すぎ/比喩)<br/>・ドメイン分散(動物偏り防止)"]
      PROMPT["d. プロンプト組立"]
      AGENTX["e. sub-agent 生成 → 候補ペア"]
      PICK --> PROMPT
      ELITE --> PROMPT
      CONS --> PROMPT
      PROMPT --> AGENTX
    end

    subgraph EXPLORE["explore: 未知の良い関係を発見"]
      direction TB
      RND["ランダム語ペアリング<br/>関連を狙わない・ドメイン最大分散<br/>(当たりは稀。novelty search)"]
    end

    MODE -- "活用" --> EXPLOIT
    MODE -- "探索" --> EXPLORE
    AGENTX --> OUT["候補ペア(+relation案) N件"]
    RND --> OUT
  end

  OUT --> SCREEN

  subgraph SCREEN["② スクリーニング（POST /api/screen, 自動）"]
    EMB["Workers AI bge-m3 で語を embedding"]
    DUP{"既存と重複?"}
    NEAR{"コサイン距離 < 0.34<br/>＝近すぎ?"}
    EMB --> DUP
    DUP -- "yes" --> D1["排除(重複)"]
    DUP -- "no" --> NEAR
    NEAR -- "yes" --> D2["排除(近すぎ)"]
    NEAR -- "no" --> PASS["通過"]
  end

  PASS --> TOPICS[("topics: 未評価で投入<br/>word_embeddings も保存")]
  TOPICS --> REVIEW

  subgraph REVIEW["③ 評価（人。/review）※将来ここをLLMに差替=LLM-only"]
    RATE["1〜5 で高速評価"]
  end

  RATE --> EVALS[("evaluations: rating(+relation)")]
  EVALS --> FOLD["④ fold: 信頼度重み付きベイズ平均<br/>topics.score を再計算(materialized)"]
  FOLD --> ACC{"score ≥ 0.55?"}
  ACC -- "yes" --> ACCEPTED["採用お題プール(関係タイプ別=QDセル)"]
  ACC -- "no" --> REJECTED["却下(理由=学習データ, DB保持)"]

  ACCEPTED --> LABEL["⑤ Claude が関係タイプを付与<br/>= QD descriptor"]
  LABEL --> COV["関係タイプ 被覆ビュー(cockpit)"]

  %% ループの学習（exploit の各入力に戻る）
  COV -. "手薄な型を選ぶ" .-> PICK
  ACCEPTED -. "型ごとのお手本" .-> ELITE
  REJECTED -. "失敗型を回避" .-> CONS
  TOPICS -. "既存を除外" .-> CONS
```

## exploit の構造（QD のセル充填）
exploit は「良いと分かっている**関係タイプ（＝QD のセル）を1つ選び、そのセルを深掘りする**」操作:
1. **狙う型を選ぶ (PICK)**: 被覆ビューで手薄な型、または実績ある型を選択。
2. **お手本を集める (ELITE)**: その型の採用済みペアを few-shot 種にする（＝そのセルの elites）。
3. **制約 (CONS)**: 既存ペアを除外、却下の失敗型を回避、ドメイン分散。
4. **組立→生成 (PROMPT/AGENTX)**: 上記を1つのプロンプトにまとめ sub-agent で新メンバーを生む。

ポイント: **型ごとに elites を種に新メンバーを増やす**ので、良い関係を保ちつつ同じセルを濃くできる。被覆が偏らないよう PICK で手薄なセルを優先するのが QD の肝。

## 凡例（実装との対応）
- ②`/api/screen`: 距離ガードレール（`NEAR_THRESHOLD=0.34`）＋重複排除。距離は M2（bge-m3, ベクトルは JSON text 保存）。
- ③`/review`: 人の高速評価。ここを LLM 評価器に差し替えると LLM-only（最終目標、今は人）。
- ④fold: ADR 0001/0002。`score` は evaluations の畳み込み（materialized・派生）。**人/LLM/ユーザーなど評価者が将来増える前提**の信頼度重み付け（単独評価の今はその縮退形。詳細・将来仕様は ADR 0001/0002）。
- ⑤関係タイプ付与＝Claude の担当。被覆＝QD（ADR 0003）の多様性軸。
- 点線4本が exploit の入力＝ループの学習（被覆→型選択 / 採用→お手本 / 却下→回避 / 既存→除外）。

## 現状の弱点（律速）
②は距離での「近すぎ」しか自動排除できず、機能アナロジー/自明 co-hyponym は③（人）まで素通り＝採用率の律速。将来 ②に「LLM 粗フィルタ」を足すと人の負荷が下がる。

注: 現状の実装は exploit を毎回フルには回しておらず、PICK/ELITE を Claude が手動で組み立てている段階。型ごとの elites 自動収集・被覆ドリブンの PICK は今後の自動化対象。
