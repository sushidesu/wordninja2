// 「とても良いお題」量産ドライバ。目標数に達するまで 生成→screen→概念審査→
// プレイ性測定 を反復する。全段レジューム可能(状態は logs/<label>/pipeline.json、
// probe はお題単位ファイル)。評価は topics DB にも書き戻す(人の★でいつでも上書き可)。
//   pnpm --filter @wordninja/testplay produce '{"logLabel":"2026-07-08-odai100","target":100}'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setMaxConcurrency } from './llm.ts'
import { validateLabel } from './logger.ts'
import { generatePairs, postEvaluation, screenPairs } from './engine/generate.ts'
import { evaluatePlayability, probePair, type PairProbe, type ProbeConfig } from './engine/probe.ts'
import { rubricReview } from './engine/rubric.ts'

type Input = {
  logLabel: string
  target?: number
  model?: string
  answererModel?: string
  screenUrl?: string
  maxConcurrency?: number
  /** 概念審査の合格点(既定4) */
  rubricMin?: number
}

type CandidateState = {
  pair: [string, string]
  topicId: string
  category?: string
  rubric?: { rating: number; reason: string }
  play?: { pass: boolean; worstTurns: number | null; reason: string; runs: number }
}

type Pipeline = {
  logLabel: string
  candidates: CandidateState[]
  stats: { generated: number; near: number; dup: number }
}

function readInput(): Input {
  const arg = process.argv.slice(2).find((a) => a !== '--')
  if (!arg) {
    console.error('使い方: produce <入力JSON文字列 | 入力JSONファイルパス>')
    process.exit(2)
  }
  const raw = arg.trim().startsWith('{') ? arg : readFileSync(arg, 'utf8')
  return JSON.parse(raw) as Input
}

const input = readInput()
validateLabel(input.logLabel ?? '')
setMaxConcurrency(input.maxConcurrency ?? 8)
const TARGET = input.target ?? 100
const MODEL = input.model ?? 'opus'
const RUBRIC_MIN = input.rubricMin ?? 4
const BASE_URL = input.screenUrl ?? 'http://localhost:8788'
const CFG: ProbeConfig = {
  proberModel: MODEL,
  answererModel: input.answererModel ?? 'sonnet',
  reachSamples: 5,
  stabilityQuestions: 6,
}

const LOGS_DIR = process.env.LOGS_DIR
  ? resolve(process.env.LOGS_DIR)
  : resolve(import.meta.dirname, '..', '..', '..', 'logs')
const dir = join(LOGS_DIR, input.logLabel)
mkdirSync(dir, { recursive: true })
const statePath = join(dir, 'pipeline.json')

function loadState(): Pipeline {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8')) as Pipeline
  } catch {
    return { logLabel: input.logLabel, candidates: [], stats: { generated: 0, near: 0, dup: 0 } }
  }
}
const state = loadState()
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

const probeFile = (pair: [string, string], run: number) =>
  join(dir, `probe-${pair[0]}×${pair[1]}${run > 1 ? `-r${run}` : ''}.json`)

async function probeWithResume(pair: [string, string], run: number): Promise<PairProbe> {
  const path = probeFile(pair, run)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PairProbe
  } catch {}
  const r = await probePair(pair, CFG)
  writeFileSync(path, JSON.stringify(r, null, 2))
  return r
}

const accepted = () => state.candidates.filter((c) => c.rubric && c.rubric.rating >= RUBRIC_MIN && c.play?.pass)
const knownPairKeys = new Set(state.candidates.map((c) => [...c.pair].sort().join(' ')))
// 生成/screen の一時障害でランを死なせない(再試行の後もダメなら次ループへ)。
// ただし連続で失敗し続ける場合はインフラが死んでいるので明示的に止める。
let consecutiveSupplyFailures = 0

console.log(`目標 ${TARGET} 題 / 現在 ${accepted().length} 題(候補 ${state.candidates.length})`)

while (accepted().length < TARGET) {
  // 1. 在庫が薄ければ生成→screen(不足分の1.5倍を見込みで補充)
  const pendingPlay = state.candidates.filter((c) => (c.rubric?.rating ?? 0) >= RUBRIC_MIN && !c.play).length
  const deficit = TARGET - accepted().length
  if (pendingPlay < Math.min(deficit, 12)) {
    try {
      // 多様性ガード: 採用済み+審査待ちの語は再利用しない。採用済みカテゴリも避けさせる
      const activeCands = state.candidates.filter((c) => !c.play || c.play.pass)
      const usedWords = [...new Set(activeCands.flatMap((c) => c.pair))]
      const usedCategories = [...new Set(accepted().map((c) => c.category).filter((x): x is string => !!x))].slice(-24)
      const { pairs } = await generatePairs(MODEL, 12, { words: usedWords, categories: usedCategories })
      state.stats.generated += pairs.length
      const usedWordSet = new Set(usedWords)
      const fresh = pairs.filter(
        (p) => !knownPairKeys.has([...p.pair].sort().join(' ')) && !p.pair.some((w) => usedWordSet.has(w)),
      )
      if (fresh.length) {
        const { kept, near, dup } = await screenPairs(BASE_URL, fresh.map((p) => p.pair))
        state.stats.near += near
        state.stats.dup += dup
        for (const k of kept) {
          const g = fresh.find((p) => p.pair[0] === k.pair[0] && p.pair[1] === k.pair[1])
          state.candidates.push({ pair: k.pair, topicId: k.topicId, category: g?.category })
          knownPairKeys.add([...k.pair].sort().join(' '))
        }
        console.log(`生成${pairs.length} → screen通過${kept.length}(近すぎ${near}・重複${dup})`)
        save()
      }
      consecutiveSupplyFailures = 0
    } catch (e) {
      consecutiveSupplyFailures++
      console.error(`⚠ 生成/screen 失敗(連続${consecutiveSupplyFailures}回): ${(e as Error).message.split('\n')[0]}`)
      if (consecutiveSupplyFailures >= 5) {
        console.error('供給側が連続失敗しているため停止します(topics サーバを確認して同コマンドで再開)')
        process.exit(1)
      }
    }
  }

  // 2. 概念審査(未審査ぶんをまとめて)
  const unrated = state.candidates.filter((c) => !c.rubric)
  if (unrated.length) {
    const { results } = await rubricReview(unrated.map((c) => c.pair), MODEL)
    for (const r of results) {
      const c = state.candidates.find((x) => x.pair[0] === r.pair[0] && x.pair[1] === r.pair[1])
      if (!c) continue
      c.rubric = { rating: r.rating, reason: r.reason }
      await postEvaluation(BASE_URL, c.topicId, 'llm:v4', r.rating).catch((e) => console.error('⚠ 評価書戻し失敗:', e.message))
    }
    const passed = results.filter((r) => r.rating >= RUBRIC_MIN).length
    console.log(`概念審査 ${results.length}件 → 合格${passed}(${results.filter((r) => r.rating >= RUBRIC_MIN).map((r) => r.pair.join('×')).join('、')})`)
    save()
  }

  // 3. プレイ性測定(概念合格・未測定ぶんを並列。∞境界は1回だけ再測定)
  const toProbe = state.candidates.filter((c) => (c.rubric?.rating ?? 0) >= RUBRIC_MIN && !c.play)
  if (toProbe.length) {
    await Promise.allSettled(
      toProbe.map(async (c) => {
        try {
          let probe = await probeWithResume(c.pair, 1)
          let verdict = evaluatePlayability(probe)
          let runs = 1
          // 「重い」判定(∞×低到達)は測定器分散の影響を受けやすいので1回だけ再測定し、良い方を採る
          if (!verdict.pass && verdict.worstTurns == null) {
            const probe2 = await probeWithResume(c.pair, 2)
            const verdict2 = evaluatePlayability(probe2)
            runs = 2
            if (verdict2.pass) verdict = verdict2
          }
          c.play = { ...verdict, runs }
          await postEvaluation(BASE_URL, c.topicId, 'llm:judge-v1', verdict.pass ? 4 : 2).catch(() => {})
          console.log(`${verdict.pass ? '✓' : '✗'} ${c.pair.join('×')} ${verdict.pass ? `(最悪${verdict.worstTurns}手)` : `— ${verdict.reason}`}`)
        } catch (e) {
          console.error(`⚠ probe失敗 ${c.pair.join('×')}: ${(e as Error).message.split('\n')[0]}`)
        }
        save()
      }),
    )
  }

  const a = accepted()
  console.log(`── 採用 ${a.length}/${TARGET}(候補${state.candidates.length}・生成${state.stats.generated})`)
  writeFileSync(
    join(dir, 'accepted.json'),
    JSON.stringify(
      {
        logLabel: input.logLabel,
        count: a.length,
        pairs: a.map((c) => ({ pair: c.pair, category: c.category, rubric: c.rubric, play: c.play, topicId: c.topicId })),
      },
      null,
      2,
    ),
  )
}

console.log(`目標達成: ${accepted().length} 題 → ${join(dir, 'accepted.json')}`)
