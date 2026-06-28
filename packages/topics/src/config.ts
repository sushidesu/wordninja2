// お題・評価まわりの調整可能な設定。運用しながら変える前提（ADR 0001, 0002）。

// 1お題あたりの語数（将来変わりうるのでアプリ層の設定値で縛る）。
export const WORDS_PER_TOPIC = 2;

// 品質の5段階評価（単極: 低→高）。score はこれの畳み込み。
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const RATINGS: { value: number; label: string; color: string }[] = [
  { value: 1, label: "悪い", color: "#ef4444" },
  { value: 2, label: "いまいち", color: "#f59e0b" },
  { value: 3, label: "ふつう", color: "#9ca3af" },
  { value: 4, label: "良い", color: "#84cc16" },
  { value: 5, label: "とても良い", color: "#16a34a" },
];

export const ratingMeta = (r: number) =>
  RATINGS.find((x) => x.value === r) ?? { value: r, label: String(r), color: "#6b7280" };

// 理由入力の補助プリセット（自由文に挿入するだけ。集約には使わない）。
export const REASON_PRESETS = ["近すぎ", "予測可能", "平凡", "遠すぎ", "意味不明"];

// 関係タイプ（QD の behavior descriptor）の補助プリセット。開語彙で、
// 良ペアに付ける。ここに無いものは自由入力（新タイプ＝novelty）。ADR 0003。
export const RELATION_PRESETS = [
  "co-hyponym(同カテゴリ)",
  "共有プロパティ",
  "機能ペア",
  "部分-全体",
  "因果",
  "文化的共起",
  "対比",
];

export const isValidRating = (r: number): boolean =>
  Number.isInteger(r) && r >= RATING_MIN && r <= RATING_MAX;

// rating(1-5) を [0,1] へ正規化。
export const normalizeRating = (r: number): number =>
  (r - RATING_MIN) / (RATING_MAX - RATING_MIN);

export const sourceKind = (evaluator: string): "human" | "llm" | "user" =>
  evaluator === "human"
    ? "human"
    : evaluator.startsWith("llm")
      ? "llm"
      : "user";

// fold（信頼度重み付きベイズ平均 = star-rating の Bayesian average）。ADR 0002。
export const FOLD = {
  // ソース種別ごとの1評価あたり基礎重み
  baseWeight: { human: 1.0, llm: 0.3, user: 0.2 } as Record<string, number>,
  // LLMパネルの合計重み上限（相関誤差対策。超えたら按分縮小）
  llmPanelCap: 0.6,
  // 事前（収縮）: 幻の票 κ を事前平均 m0 で置く
  priorMean: 0.5, // m0
  phantomVotes: 1, // κ
  // 採用閾値（score >= threshold で採用。正規化スコア [0,1]）
  threshold: 0.55,
};
