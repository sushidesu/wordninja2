// お題・評価まわりの調整可能な設定。運用しながら変える前提（ADR 0001）。

// 1お題あたりの語数（将来変わりうるのでアプリ層の設定値で縛る）。
export const WORDS_PER_TOPIC = 2;

export type Verdict =
  | "good"
  | "close"
  | "too_close"
  | "predictable"
  | "flat"
  | "too_far"
  | "nonsense";

export const VERDICT_KEYS: Verdict[] = [
  "good",
  "close",
  "too_close",
  "predictable",
  "flat",
  "too_far",
  "nonsense",
];

// 採用イベント = {good, close}（惜しい以上）。fold はこの二値だけ使う。
// 5つの却下理由は nominal メタデータで、score には使わない。
export const isAccept = (v: string): boolean => v === "good" || v === "close";

// 評価者の種別判定。
export const sourceKind = (evaluator: string): "human" | "llm" | "user" =>
  evaluator === "human"
    ? "human"
    : evaluator.startsWith("llm")
      ? "llm"
      : "user";

// fold（信頼度重み付きベイズ集約 Beta-Binomial）の設定。
export const FOLD = {
  // ソース種別ごとの1評価あたり基礎重み
  baseWeight: { human: 1.0, llm: 0.3, user: 0.2 } as Record<string, number>,
  // LLMパネルの合計重み上限（相関誤差対策。超えたら按分縮小）
  llmPanelCap: 0.6,
  // Beta 事前（少数サンプルの収縮）
  prior: { a0: 1, b0: 1 },
  // 採用閾値（score >= threshold で採用）
  threshold: 0.5,
};
