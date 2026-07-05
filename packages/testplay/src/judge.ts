// お題の直接測定 CLI。ゲームを回さずに、お題の質を決める量を測って保存する。
//   pnpm --filter @wordninja/testplay judge '<json>'
//   入力: { logLabel, pair | pairs, proberModel?, answererModel?, reachSamples?, stabilityQuestions?, maxConcurrency? }
// 出力: logs/<logLabel>/judge.json(お題ごとの成分と予測手数)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const pairs = input.pairs ?? (input.pair ? [input.pair] : [])
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

const results: PairProbe[] = []
for (const pair of pairs) {
  console.log(`測定中: ${pair.join('×')}`)
  const r = await probePair(pair as [string, string], cfg)
  results.push(r)
  for (const d of r.directions) {
    console.log(
      `  ${d.seekerWord}側→「${d.targetWord}」: 到達率${d.reachability.inTopRate} MRR${d.reachability.meanReciprocalRank}` +
        ` | 理想質問数${d.discriminability.idealQuestions ?? `∞(最終p${d.discriminability.targetFinalProb}/r${d.discriminability.targetFinalRank})`}` +
        ` | hedge${d.answerability.hedgeRate} 不一致${d.answerability.inconsistencyRate}` +
        ` | 予測${d.predictedTurns ?? '—'}手`,
    )
  }
}

const LOGS_DIR = process.env.LOGS_DIR
  ? resolve(process.env.LOGS_DIR)
  : resolve(import.meta.dirname, '..', '..', '..', 'logs')
const dir = join(LOGS_DIR, input.logLabel)
mkdirSync(dir, { recursive: true })
const path = join(dir, 'judge.json')
writeFileSync(path, JSON.stringify({ logLabel: input.logLabel, config: cfg, results }, null, 2))
console.log(`保存: ${path}`)
const totalCalls = results.reduce((a, r) => a + r.usage.calls, 0)
console.log(`総コール ${totalCalls} / 参考コスト $${results.reduce((a, r) => a + r.usage.costUsd, 0).toFixed(2)}`)
