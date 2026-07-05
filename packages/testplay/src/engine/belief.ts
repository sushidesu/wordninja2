// ── 持続的ベイズ信念 + 外部化 EIG(UoT: Uncertainty of Thoughts)──────
// LLM は「支持集合の提案・質問生成・回答予想」だけ担当し、確率(信念)は
// コードが所有する。観測回答ごとに P(語|回答) ∝ P(語)·P(回答|語,質問) で
// ベイズ更新し、質問の"選択"は事後確率に対する EIG 計算でコードが行う。純関数のみ。
import type { Candidate, Value } from '../types.ts'

// 最有力候補の(正規化後)事後確率がこれ以上なら当てに行く。0.55 では「rank1・
// p0.4台で時間切れ」が続出した(実測)。誤推測がほぼゼロ(=事後の質が高い)
// ことを踏まえ、早当て勝負に寄せて 0.50。
export const GUESS_THRESHOLD = 0.5
// 支持集合の上限(事後上位のみ残す)。毎ターンの新提案を無制限に和集合すると
// 集合が膨張し信念が拡散して収束しない(EIG横並び・冗長質問が沈まない)ため。
export const MAX_SUPPORT = 12
// 予測と実測の軟マッチ尤度。単一の曖昧不一致で候補をゼロにしない。
// - invert(はい↔いいえの明確な逆)は oracle の誤答率を織り込んだ床。0.05 は
//   一発誤答で正解仮説が死に(0.34→0.03)、0.10〜0.15 は弁別が鈍り rank1 のまま
//   時間切れした(いずれも実測)。0.07 はその中間。
// - fuzzyPred(予測が曖昧・観測は明確)は 0.5: 曖昧予測は「どちらもあり得る」の
//   表明で、矛盾ではない。0.35 だと曖昧予測3回の累積(×0.44³)で正解語が枯死した
//   (実測: カフェ)。fuzzyObs(観測側が曖昧)は従来どおり 0.35。
export const LIKELIHOOD = { match: 0.8, fuzzyPred: 0.5, fuzzyObs: 0.35, invert: 0.07 }

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
// 部分的にそう/わからない を曖昧値として扱う。曖昧の向きで罰を変える(非対称)。
export function likelihood(pred: Value, obs: Value): number {
  if (pred === obs) return LIKELIHOOD.match
  const fuzzy = (v: Value) => v === '部分的にそう' || v === 'わからない'
  if (fuzzy(pred)) return LIKELIHOOD.fuzzyPred
  if (fuzzy(obs)) return LIKELIHOOD.fuzzyObs
  return LIKELIHOOD.invert // はい↔いいえ の明確な逆
}

// 観測回答で信念をベイズ更新(in place)。尤度は回答シミュレーションの予想行を流用。
export function bayesUpdate(belief: Candidate[], row: PredictionRow, observed: Value): Candidate[] {
  for (const c of belief) c.prob *= likelihood(row[c.word] ?? 'わからない', observed)
  const s = belief.reduce((a, c) => a + c.prob, 0)
  if (s > 0) for (const c of belief) c.prob /= s
  return belief
}

function normalize(list: Candidate[]): Candidate[] {
  const s = list.reduce((a, c) => a + c.prob, 0) || 1
  for (const c of list) c.prob /= s
  return list
}

// 語の表記ゆれ部品に分解する: 括弧の補足を除去し、「A・B」「A/B」併記を分割。
// プロンプトで併記を禁止しても LLM は「カフェ・喫茶店」「病院(クリニック)」を
// 出してくる(実測)。同一概念が別文字列で並存すると事後質量が分裂し、
// しきい値に届かず引き分け化するため、同一性判定はコードが所有する。
export function wordParts(word: string): string[] {
  const stripped = word.replace(/[((][^))]*[))]/g, '').trim()
  return stripped
    .split(/[・/／]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// LLM が提案した支持集合を既存の信念に統合する(切り詰めはしない)。確率はコードが
// 所有するので、既存語の事後は保持し、新出語だけ小さな事前で追加する。信念が空
// (初手)なら LLM のもっともらしさをそのまま事前とする。棄却語は復活させない。
export function mergeSupport(belief: Candidate[], proposed: Candidate[], rejected: Set<string>): Candidate[] {
  const isRejected = (w: string) => wordParts(w).some((p) => rejected.has(p)) || rejected.has(w)
  const kept = belief.filter((c) => !isRejected(c.word))
  const byWord = new Map(kept.map((c) => [c.word, c]))
  // 表記ゆれの同一視: 提案語の部品(括弧除去・併記分割)が既存候補に一致したら
  // 同一概念として吸収する(質量分裂の防止)。新規追加は先頭の部品を正準形とする。
  const knownParts = new Set(kept.flatMap((c) => wordParts(c.word)))
  // 新出語の参入点は既存語の中央値。最小値だと「累積ペナルティを既に負った最弱の
  // 既存語」が基準になり、遡及係数(≤1)と合わさって新出語が同ターンの切り詰めで
  // 即死する(実測: 正解語が24手一度も支持集合に入らなかった)。中央値なら公平に
  // 参入し、過去との矛盾は遡及係数が、以後の弁別は通常のベイズ更新が受け持つ。
  const sorted = kept.map((c) => c.prob).sort((a, b) => a - b)
  const seed = kept.length ? Math.max(sorted[Math.floor(sorted.length / 2)], 0.02) : 0
  for (const p of proposed) {
    if (isRejected(p.word)) continue
    const parts = wordParts(p.word)
    const canonical = parts[0] ?? p.word.trim()
    if (!canonical) continue
    if (byWord.has(canonical) || parts.some((x) => knownParts.has(x))) continue
    byWord.set(canonical, { word: canonical, prob: kept.length ? seed : p.prob || 0.01 })
    for (const x of parts) knownParts.add(x)
  }
  return normalize([...byWord.values()])
}

// 事後上位 MAX_SUPPORT に切り詰め(有界な可能性集合。ビーム探索的 truncation)。
// 新出語の遡及条件付け(historyConsistencyFactor)の後に呼ぶこと — 条件付け前に
// 切ると、過去の事実に整合する有力な新参語を floor 確率のまま追い出してしまう。
export function truncateSupport(belief: Candidate[]): Candidate[] {
  let list = [...belief].sort((a, b) => b.prob - a.prob)
  if (list.length > MAX_SUPPORT) list = list.slice(0, MAX_SUPPORT)
  return normalize(list)
}

// 新出語を過去の観測で条件付けする係数 = 矛盾フィルタ。
// 「予想も観測も明確(はい/いいえ)で、かつ食い違う」場合だけ罰する。
// 曖昧(部分的にそう/わからない)や予想欠落は証拠なしとして係数 1 —
// これを罰すると(×fuzzy/match が観測数ぶん累積して)新出語が参入前に
// 死に、支持集合に新しい仮説が二度と入らなくなる(実測済みの故障モード)。
export function historyConsistencyFactor(pairs: { pred?: Value; obs: Value }[]): number {
  const definite = (v: Value) => v === 'はい' || v === 'いいえ'
  let f = 1
  for (const { pred, obs } of pairs) {
    if (pred === undefined || !definite(pred) || !definite(obs)) continue
    if (pred !== obs) f *= LIKELIHOOD.invert / LIKELIHOOD.match
  }
  return f
}

// LLM が読み出した分布(readout モード)の整形: 表記ゆれを正準形に統合して確率を
// 合算し、棄却語を除いて正規化する。自己申告の分布でも同一性判定はコードが持つ。
export function dedupeReadout(cands: Candidate[], rejected: Set<string>): Candidate[] {
  const byWord = new Map<string, Candidate>()
  for (const c of cands) {
    if (!c.word || !(c.prob > 0)) continue
    const parts = wordParts(c.word)
    const canonical = parts[0] ?? c.word.trim()
    if (!canonical) continue
    if (parts.some((p) => rejected.has(p)) || rejected.has(c.word)) continue
    const hit = byWord.get(canonical)
    if (hit) hit.prob += c.prob
    else byWord.set(canonical, { word: canonical, prob: c.prob })
  }
  return normalize([...byWord.values()].sort((a, b) => b.prob - a.prob))
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
