// CLI エントリ。入力(JSON)は workflow 版の args と同じ contract。
//   pnpm --filter @wordninja/testplay play -- '<json>'
//   pnpm --filter @wordninja/testplay play -- path/to/input.json
import { readFileSync } from 'node:fs'
import { setMaxConcurrency } from './llm.ts'
import { validateLabel } from './logger.ts'
import type { Input } from './types.ts'
import { runTestplay } from './engine/run.ts'

function readInput(): Input {
  // pnpm run 経由だと区切りの '--' が argv にそのまま残ることがある
  const arg = process.argv.slice(2).find((a) => a !== '--')
  if (!arg) {
    console.error('使い方: play <入力JSON文字列 | 入力JSONファイルパス>')
    console.error('例: play \'{"logLabel":"2026-07-03-soba","pair":["そば","うどん"],"repeat":3,"models":{"1":"opus","2":"opus"}}\'')
    process.exit(2)
  }
  const raw = arg.trim().startsWith('{') ? arg : readFileSync(arg, 'utf8')
  return JSON.parse(raw) as Input
}

const input = readInput()
validateLabel(input.logLabel ?? '')
setMaxConcurrency(input.maxConcurrency ?? 8)

const started = Date.now()
const summary = await runTestplay(input)
const s = summary.summary
console.log(
  [
    '',
    `── 結果 ── ${summary.logLabel}`,
    `ゲーム ${s.games} / 解決 ${s.solved} / 引分 ${s.draws} / 解決時平均 ${s.avgTurns ?? '–'} 手`,
    `コール ${s.cost.calls} / 出力 ${Math.round(s.cost.outputTokens / 1000)}k tok / キャッシュ読取 ${Math.round(s.cost.cacheReadTokens / 1000)}k tok / 参考コスト $${s.cost.costUsd.toFixed(2)}`,
    `実時間 ${Math.round((Date.now() - started) / 1000)}s`,
  ].join('\n'),
)
