// ── 持続的ベイズ信念 + 外部化 EIG(UoT: Uncertainty of Thoughts)──────
// LLM は「支持集合の提案・質問生成・回答予想」だけ担当し、確率(信念)は
// コードが所有する。観測回答ごとに P(語|回答) ∝ P(語)·P(回答|語,質問) で
// ベイズ更新し、質問の"選択"は事後確率に対する EIG 計算でコードが行う。
// workflow 版からの 1:1 移植(意思決定の挙動は変えない)。純関数のみ。
import type { Candidate, Value } from '../types.ts'

export const GUESS_THRESHOLD = 0.55 // 最有力候補の(正規化後)事後確率がこれ以上なら当てに行く
// 支持集合の上限(事後上位のみ残す)。毎ターンの新提案を無制限に和集合すると
// 集合が膨張し信念が拡散して収束しない(EIG横並び・冗長質問が沈まない)ため。
export const MAX_SUPPORT = 12
// 予測と実測の軟マッチ尤度。単一の曖昧不一致で候補をゼロにしない。
export const LIKELIHOOD = { match: 0.8, fuzzy: 0.35, invert: 0.05 }

// 1質問ぶんの予想回答(語 → 予想値)。語はコード側の正準表記(candidates の word)で
// 引く。LLM の echo 文字列を照合に使わない(表記ゆれで silent に照合が死ぬため)。
export type PredictionRow = Record<string, Value>

export function entropy(probs: number[]): number {
  const s = probs.reduce((a, p) => a + p, 0)
  if (s <= 0) return 0
  let h = 0
  for (const p of probs) {
    const q = p / s
    if (q > 0) h -= q * Math.log2(q)
  }
  return h
}

// 質問の期待情報利得: H(事前) − Σ_v P(答えv)·H(答えvで残る候補)
export function eig(row: PredictionRow, candidates: Candidate[]): number {
  const total = candidates.reduce((a, c) => a + c.prob, 0) || 1
  const buckets: Record<string, number[]> = {}
  for (const c of candidates) {
    const v = row[c.word] ?? 'わからない'
    ;(buckets[v] ??= []).push(c.prob)
  }
  let expPost = 0
  for (const v in buckets) {
    const m = buckets[v].reduce((a, p) => a + p, 0)
    expPost += (m / total) * entropy(buckets[v])
  }
  return entropy(candidates.map((c) => c.prob)) - expPost
}

// 予測回答 pred と実測 obs の尤度 P(obs | 語, 質問)。はい/いいえ を確定、
// 部分的にそう/わからない を曖昧値として扱う3段階。
export function likelihood(pred: Value, obs: Value): number {
  if (pred === obs) return LIKELIHOOD.match
  const fuzzy = (v: Value) => v === '部分的にそう' || v === 'わからない'
  if (fuzzy(pred) || fuzzy(obs)) return LIKELIHOOD.fuzzy
  return LIKELIHOOD.invert // はい↔いいえ の明確な逆
}

// 観測回答で信念をベイズ更新(in place)。尤度は回答シミュレーションの予想行を流用。
export function bayesUpdate(belief: Candidate[], row: PredictionRow, observed: Value): Candidate[] {
  for (const c of belief) c.prob *= likelihood(row[c.word] ?? 'わからない', observed)
  const s = belief.reduce((a, c) => a + c.prob, 0)
  if (s > 0) for (const c of belief) c.prob /= s
  return belief
}

// LLM が提案した支持集合を既存の信念に統合する。確率はコードが所有するので、
// 既存語の事後は保持し、新出語だけ小さな事前で追加する。信念が空(初手)なら
// LLM のもっともらしさをそのまま事前とする。誤推測で棄却された語は復活させない。
export function reconcileSupport(belief: Candidate[], proposed: Candidate[], rejected: Set<string>): Candidate[] {
  const kept = belief.filter((c) => !rejected.has(c.word))
  const byWord = new Map(kept.map((c) => [c.word, c]))
  const seed = kept.length ? Math.max(Math.min(...kept.map((c) => c.prob)), 0.02) : 0
  for (const p of proposed) {
    if (rejected.has(p.word) || byWord.has(p.word)) continue
    byWord.set(p.word, { word: p.word, prob: kept.length ? seed : p.prob || 0.01 })
  }
  let list = [...byWord.values()]
  const norm = () => {
    const s = list.reduce((a, c) => a + c.prob, 0) || 1
    for (const c of list) c.prob /= s
  }
  norm()
  // 事後上位 MAX_SUPPORT に切り詰め(有界な可能性集合。ビーム探索的 truncation)
  list.sort((a, b) => b.prob - a.prob)
  if (list.length > MAX_SUPPORT) list = list.slice(0, MAX_SUPPORT)
  norm()
  return list
}

export function argmax<T>(arr: T[], f: (x: T) => number): T | null {
  let best: T | null = null
  let bestV = -Infinity
  for (const x of arr) {
    const v = f(x)
    if (v > bestV) {
      bestV = v
      best = x
    }
  }
  return best
}
