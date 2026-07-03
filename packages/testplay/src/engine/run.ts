// ── run オーケストレーション ─────────────────────────────────────
// 入力を正規化 → ユニーク語のプロファイルを一度だけ確定 → 全ゲームを並列実行
// (同時実行の実体は llm.ts のセマフォ = claude プロセス数)→ 集計して保存。
import { addUsage, callLlm, emptyUsage, setEffort } from '../llm.ts'
import { readGameLog, writeGameLog, writeSummary } from '../logger.ts'
import type {
  GameCost, GameLog, Input, Model, Player, PlayMode, ResolvedConfig, RunSpec, Summary, TopicSummary,
} from '../types.ts'
import { GUESS_THRESHOLD, LIKELIHOOD, MAX_SUPPORT } from './belief.ts'
import { playGame, SYSTEM_PROMPT, type GameInstance } from './game.ts'
import { profileWord } from './oracle.ts'

const DEFAULT_ANSWERER: Model = 'sonnet'
const DEFAULT_THINKER: Model = 'sonnet'
const DEFAULT_MAX_TURNS = 20

function resolveSpecs(input: Input): RunSpec[] {
  if (Array.isArray(input.runs)) return input.runs
  if (Array.isArray(input.pairs)) return input.pairs.map((p) => ({ pair: p }))
  if (input.pair) return [{ pair: input.pair }]
  throw new Error('お題が指定されていません。pair([語,語]) / pairs / runs のいずれかを指定してください。')
}

function validatePair(p: unknown, where: string): asserts p is [string, string] {
  if (!Array.isArray(p) || p.length !== 2 || !p.every((w) => typeof w === 'string' && w.trim())) {
    throw new Error(`${where} の pair が不正です(2語の非空文字列配列が必要): ${JSON.stringify(p)}`)
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function runTestplay(input: Input): Promise<Summary> {
  const specs = resolveSpecs(input)
  specs.forEach((s, i) => validatePair(s?.pair, `runs[${i}]`))

  const answererModel = input.answererModel ?? DEFAULT_ANSWERER
  const maxTurnsPerPlayer = input.maxTurnsPerPlayer ?? DEFAULT_MAX_TURNS
  const globalRepeat = input.repeat ?? 1
  setEffort(input.effort ?? null)

  const resolveModels = (spec: RunSpec): Record<Player, Model> => ({
    1: spec.models?.[1] ?? input.models?.[1] ?? DEFAULT_THINKER,
    2: spec.models?.[2] ?? input.models?.[2] ?? DEFAULT_THINKER,
  })
  const resolveModes = (spec: RunSpec): Record<Player, PlayMode> => ({
    1: (spec.playModes?.[1] ?? input.playModes?.[1]) === 'light' ? 'light' : 'externalized',
    2: (spec.playModes?.[2] ?? input.playModes?.[2]) === 'light' ? 'light' : 'externalized',
  })

  const instances: GameInstance[] = []
  specs.forEach((spec, specIndex) => {
    const repeat = spec.repeat ?? globalRepeat
    for (let r = 0; r < repeat; r++) {
      instances.push({
        pair: spec.pair, models: resolveModels(spec), playModes: resolveModes(spec),
        specIndex, replicaIndex: r, replicaCount: repeat,
      })
    }
  })

  // 語の実体はユニーク語ごとに一度だけ確定(レプリカ間で共有。以前は
  // レプリカごとに重複コールしていた)。usage は run レベルで計上する。
  const profileUsage = emptyUsage()
  const profileCache = new Map<string, Promise<string>>()
  const getProfile = (word: string): Promise<string> => {
    let p = profileCache.get(word)
    if (!p) {
      p = profileWord(
        async (args) => {
          const r = await callLlm<any>({ ...args, systemPrompt: SYSTEM_PROMPT })
          addUsage(profileUsage, r.usage)
          return r.data
        },
        word,
        answererModel,
      )
      profileCache.set(word, p)
    }
    return p
  }

  console.log(
    `${instances.length} ゲームを並列実行(claude プロセス同時上限 ${input.maxConcurrency ?? 8})。お題 ${specs.length} 種 / 総リプレイ ${instances.length}`,
  )

  const settled = await Promise.allSettled(
    instances.map(async (inst) => {
      // 同一 logLabel での再実行はレジューム: 完了済みゲームはそのまま採用する
      const existing = readGameLog(input.logLabel, inst.specIndex, inst.replicaIndex)
      if (existing) {
        console.log(`スキップ(完了済み): ${inst.pair.join('×')} #${inst.replicaIndex + 1}`)
        return existing
      }
      const [p1, p2] = await Promise.all([getProfile(inst.pair[0]), getProfile(inst.pair[1])])
      const game = await playGame(inst, { answererModel, maxTurnsPerPlayer }, { 1: p1, 2: p2 })
      const path = writeGameLog(input.logLabel, game)
      console.log(`保存: ${path}`)
      return game
    }),
  )
  const games: GameLog[] = []
  for (const [i, r] of settled.entries()) {
    if (r.status === 'fulfilled') games.push(r.value)
    else console.error(`✗ game ${instances[i].pair.join('×')} #${instances[i].replicaIndex + 1} 失敗: ${r.reason}`)
  }
  const failed = settled.length - games.length

  // ── 集計 ──
  const decided = games.filter((g) => g.solved)
  const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

  const topics: TopicSummary[] = specs.map((spec, specIndex) => {
    const mine = games.filter((g) => g.specIndex === specIndex)
    const solved = mine.filter((g) => g.solved)
    const perWord: TopicSummary['perWord'] = {}
    for (const word of spec.pair) {
      const wins = solved.filter((g) => g.winnerWord === word)
      // この語を「当てる側」だったプレイヤーの収束(相手の単語 = word)
      const seekers = mine.flatMap((g) => {
        const seeker: Player = g.words[1] === word ? 2 : 1
        const m = g.metrics[seeker]
        return m ? [m] : []
      })
      perWord[word] = {
        wins: wins.length,
        avgTurnsToWin: avg(wins.map((g) => g.totalTurns)),
        avgTargetFirstInSupport: avg(seekers.flatMap((m) => (m.targetFirstInSupportTurn != null ? [m.targetFirstInSupportTurn] : []))),
        avgTargetFinalProb: avg(seekers.flatMap((m) => (m.targetFinalProb != null ? [m.targetFinalProb] : []))),
      }
    }
    return {
      pair: spec.pair,
      solvedCount: solved.length,
      replicaCount: mine.length,
      avgTurns: avg(solved.map((g) => g.totalTurns)),
      perWord,
    }
  })

  const totalCost: GameCost = { ...emptyUsage(), byRole: { thinker: emptyUsage(), oracle: emptyUsage() } }
  for (const g of games) {
    addUsage(totalCost, g.cost)
    addUsage(totalCost.byRole.thinker, g.cost.byRole.thinker)
    addUsage(totalCost.byRole.oracle, g.cost.byRole.oracle)
  }
  addUsage(totalCost, profileUsage)
  addUsage(totalCost.byRole.oracle, profileUsage)

  const config: ResolvedConfig = {
    answererModel,
    maxTurnsPerPlayer,
    effort: input.effort ?? null,
    guessThreshold: GUESS_THRESHOLD,
    maxSupport: MAX_SUPPORT,
    likelihood: LIKELIHOOD,
    runs: specs as ResolvedConfig['runs'],
    harness: 'claude-cli',
  }

  const summary: Summary = {
    logLabel: input.logLabel,
    config,
    summary: {
      games: games.length,
      solved: decided.length,
      draws: games.length - decided.length,
      byPosition: {
        先手P1: decided.filter((g) => g.winner === 1).length,
        後手P2: decided.filter((g) => g.winner === 2).length,
      },
      byWord: decided.reduce<Record<string, number>>((acc, g) => {
        if (g.winnerWord) acc[g.winnerWord] = (acc[g.winnerWord] ?? 0) + 1
        return acc
      }, {}),
      avgTurns: avg(decided.map((g) => g.totalTurns)),
      cost: totalCost,
    },
    topics,
  }
  const path = writeSummary(input.logLabel, summary)
  console.log(`保存: ${path}`)
  if (failed) console.error(`⚠ ${failed} ゲームが失敗しました(上記ログ参照)。summary は完了分のみ。`)
  return summary
}
