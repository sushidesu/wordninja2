// ── LLM クライアント(claude -p ヘッドレス)─────────────────────────
// 各コールは `claude -p --json-schema` を1プロセス起動する。サブスク認証を
// そのまま使うための選択(素の API はキー必須)。プロセス起動コスト(~1s)は
// 推論時間(数秒〜数十秒)に対して誤差。
// - 構造化出力は CLI の StructuredOutput ツールがサーバ側で強制する
// - usage(トークン・コスト)を結果 JSON から回収し観測ログに残す
// - 思考系ツールを disallow してベースコンテキストを最小化(~20k→~11k)
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LlmUsage } from './types.ts'

// StructuredOutput 以外の標準ツールを外す(定義ぶんの入力トークン削減)。
// 存在しない名前を渡すと警告が stdout を汚すので、実在確認済みの名前のみ。
const DISALLOWED_TOOLS = [
  'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'TodoWrite', 'NotebookEdit',
  'BashOutput', 'KillShell',
]

// 会話やプロジェクトの文脈を持ち込まない中立な作業ディレクトリ
// (リポジトリ直下で起動すると CLAUDE.md やフックが混入する)
const NEUTRAL_CWD = mkdtempSync(join(tmpdir(), 'testplay-llm-'))

// opus は並列時のスループット制約下で1コール数分かかることがある(240s では
// 実測でタイムアウト続出)。thinking 込みの遅いコールを許容する。
const CALL_TIMEOUT_MS = 600_000

export type LlmCall = {
  model: string
  systemPrompt: string
  prompt: string
  schema: object
  label: string
}

export type LlmResult<T> = { data: T; usage: LlmUsage }

export function emptyUsage(): LlmUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, durationMs: 0 }
}

export function addUsage(into: LlmUsage, u: LlmUsage): void {
  into.calls += u.calls
  into.inputTokens += u.inputTokens
  into.outputTokens += u.outputTokens
  into.cacheReadTokens += u.cacheReadTokens
  into.cacheWriteTokens += u.cacheWriteTokens
  into.costUsd += u.costUsd
  into.durationMs += u.durationMs
}

// 同時実行の上限(claude プロセス数)。超過分はキューで待つ。
let permits = 8
const waiters: (() => void)[] = []
// run 開始前に一度だけ呼ぶ(実行中の再設定は想定しない)
export function setMaxConcurrency(n: number): void {
  permits = n
}

// 全コール共通の思考量(claude -p --effort)。null なら CLI 既定に任せる。
let effortFlag: string | null = null
export function setEffort(effort: string | null): void {
  effortFlag = effort
}
async function acquire(): Promise<void> {
  if (permits > 0) {
    permits--
    return
  }
  await new Promise<void>((resolve) => waiters.push(resolve))
  permits--
}
function release(): void {
  permits++
  const next = waiters.shift()
  if (next) next()
}

function runClaude(call: LlmCall): Promise<{ raw: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', call.model,
      '--output-format', 'json',
      '--system-prompt', call.systemPrompt,
      '--json-schema', JSON.stringify(call.schema),
      '--disallowedTools', ...DISALLOWED_TOOLS,
    ]
    if (effortFlag) args.push('--effort', effortFlag)
    const child = spawn('claude', args, { cwd: NEUTRAL_CWD, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`timeout ${CALL_TIMEOUT_MS}ms: ${call.label}`))
    }, CALL_TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`claude exit ${code}: ${call.label}\n${err.slice(0, 500)}${out.slice(0, 500)}`))
      else resolve({ raw: out, code })
    })
    child.stdin.write(call.prompt)
    child.stdin.end()
  })
}

// stdout に警告行が混ざり得るため、最後の '{' 始まり行を結果 JSON として拾う
function parseResultJson(raw: string): any {
  const lines = raw.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{')) return JSON.parse(line)
  }
  throw new Error(`no JSON in claude output: ${raw.slice(0, 300)}`)
}

async function callOnce<T>(call: LlmCall): Promise<LlmResult<T>> {
  const started = Date.now()
  const { raw } = await runClaude(call)
  const j = parseResultJson(raw)
  if (j.is_error) throw new Error(`claude result error: ${call.label}: ${String(j.result).slice(0, 300)}`)
  if (j.structured_output == null) throw new Error(`no structured_output: ${call.label}: ${String(j.result).slice(0, 300)}`)
  const u = j.usage ?? {}
  return {
    data: j.structured_output as T,
    usage: {
      calls: 1,
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      costUsd: j.total_cost_usd ?? 0,
      durationMs: Date.now() - started,
    },
  }
}

// 失敗時はクールダウンを挟んで再試行する。タイムアウトの主因はサブスクの
// 使用量ウィンドウ到達時に CLI が内部バックオフで固まること(実測)なので、
// 待てば回復する。待ち時間はセマフォを持たずに(他のコールを塞がずに)過ごす。
const RETRY_WAITS_MS = [0, 60_000, 300_000]

export async function callLlm<T>(call: LlmCall): Promise<LlmResult<T>> {
  let lastError: Error = new Error('unreachable')
  for (const [attempt, wait] of RETRY_WAITS_MS.entries()) {
    if (wait > 0) {
      console.error(`⚠ ${call.label}: ${lastError.message.split('\n')[0]} → ${wait / 1000}s 待って再試行 (${attempt + 1}/${RETRY_WAITS_MS.length})`)
      await new Promise((r) => setTimeout(r, wait))
    }
    await acquire()
    try {
      return await callOnce<T>(call)
    } catch (e) {
      lastError = e as Error
    } finally {
      release()
    }
  }
  throw lastError
}
