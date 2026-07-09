// お題の直接測定 CLI。ゲームを回さずに、お題の質を決める量を測って保存する。
//   pnpm --filter @wordninja/testplay judge '<json>'
//   入力: { logLabel, pair | pairs, proberModel?, answererModel?, reachSamples?, stabilityQuestions?, maxConcurrency? }
// 出力: logs/<logLabel>/probe-<A>×<B>.json(お題単位・完了ごとに書く=部分障害に強い)
//       logs/<logLabel>/judge.json(集約。再実行時は既存のお題単位ファイルを再利用=レジューム)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setMaxConcurrency } from './llm.ts'
import { validateLabel } from './logger.ts'
import { probePair, type PairProbe, type ProbeConfig } from './engine/probe.ts'

type Input = {
  logLabel: string
  pair?: [string, string]
  pairs?: [string, string][]
  proberModel?: string
  answererModel?: string
  reachSamples?: number
  stabilityQuestions?: number
  maxConcurrency?: number
}

function readInput(): Input {
  const arg = process.argv.slice(2).find((a) => a !== '--')
  if (!arg) {
    console.error('使い方: judge <入力JSON文字列 | 入力JSONファイルパス>')
    process.exit(2)
  }
  const raw = arg.trim().startsWith('{') ? arg : readFileSync(arg, 'utf8')
  return JSON.parse(raw) as Input
}

const input = readInput()
validateLabel(input.logLabel ?? '')
setMaxConcurrency(input.maxConcurrency ?? 8)
const pairs = (input.pairs ?? (input.pair ? [input.pair] : [])) as [string, string][]
if (!pairs.length) {
  console.error('pair / pairs が必要です')
  process.exit(2)
}

const cfg: ProbeConfig = {
  proberModel: input.proberModel ?? 'opus',
  answererModel: input.answererModel ?? 'sonnet',
  reachSamples: input.reachSamples ?? 5,
  stabilityQuestions: input.stabilityQuestions ?? 6,
}

const LOGS_DIR = process.env.LOGS_DIR
  ? resolve(process.env.LOGS_DIR)
  : resolve(import.meta.dirname, '..', '..', '..', 'logs')
const dir = join(LOGS_DIR, input.logLabel)
mkdirSync(dir, { recursive: true })
const pairFile = (pair: [string, string]) => join(dir, `probe-${pair[0]}×${pair[1]}.json`)

function readExisting(pair: [string, string]): PairProbe | null {
  try {
    return JSON.parse(readFileSync(pairFile(pair), 'utf8')) as PairProbe
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

function report(r: PairProbe): void {
  for (const d of r.directions) {
    console.log(
      `  ${d.seekerWord}側→「${d.targetWord}」: 到達率${d.reachability.inTopRate} MRR${d.reachability.meanReciprocalRank}` +
        ` | 理想質問数${d.discriminability.idealQuestions ?? `∞(最終p${d.discriminability.targetFinalProb}/r${d.discriminability.targetFinalRank})`}` +
        ` | hedge${d.answerability.hedgeRate} 不一致${d.answerability.inconsistencyRate}` +
        ` | 予測${d.predictedTurns ?? '—'}手`,
    )
  }
}

// お題単位で並列(コールの同時実行は llm.ts のセマフォが締める)。
// 完了ごとにお題単位ファイルへ保存し、再実行時は既存分をスキップ(レジューム)。
const settled = await Promise.allSettled(
  pairs.map(async (pair) => {
    const existing = readExisting(pair)
    if (existing) {
      console.log(`スキップ(測定済み): ${pair.join('×')}`)
      return existing
    }
    const r = await probePair(pair, cfg)
    writeFileSync(pairFile(pair), JSON.stringify(r, null, 2))
    console.log(`測定完了: ${pair.join('×')}`)
    report(r)
    return r
  }),
)
const results: PairProbe[] = []
for (const [i, s] of settled.entries()) {
  if (s.status === 'fulfilled') results.push(s.value)
  else console.error(`✗ ${pairs[i].join('×')} 失敗: ${s.reason}`)
}

writeFileSync(join(dir, 'judge.json'), JSON.stringify({ logLabel: input.logLabel, config: cfg, results }, null, 2))
console.log(`保存: ${join(dir, 'judge.json')}(${results.length}/${pairs.length} お題)`)
const fresh = results.reduce((a, r) => a + r.usage.calls, 0)
console.log(`総コール ${fresh} / 参考コスト $${results.reduce((a, r) => a + r.usage.costUsd, 0).toFixed(2)}`)
