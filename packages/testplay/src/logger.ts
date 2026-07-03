// ログ保存(リポジトリ直下 logs/<label>/)。viewer が毎リクエスト直読みする
// 唯一のソース。ゲーム完了の瞬間に書く = 部分障害に強い(途中で死んでも完了分は残る)。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { GameLog, Summary } from './types.ts'

// packages/testplay/src → リポジトリ直下 /logs(viewer と同じ解決)
const LOGS_DIR = process.env.LOGS_DIR
  ? resolve(process.env.LOGS_DIR)
  : resolve(import.meta.dirname, '..', '..', '..', 'logs')

export function validateLabel(label: string): void {
  if (!label.trim()) throw new Error('logLabel(run名)が必要です。logs/<logLabel>/ に保存します。')
  if (/[/\\]|\.\./.test(label)) throw new Error('logLabel に / \\ .. は使えません(パス安全のため)。')
}

function write(label: string, file: string, obj: unknown): string {
  const dir = join(LOGS_DIR, label)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, file)
  writeFileSync(path, JSON.stringify(obj, null, 2))
  return path
}

export function writeGameLog(label: string, game: GameLog): string {
  return write(label, `game-${game.specIndex}-${game.replicaIndex}.json`, game)
}

// 既存の完了済みゲームを読む(同一 logLabel での再実行をレジュームにするため)。
// 無ければ null。壊れた JSON は投げる(silent に再実行して上書きしない)。
export function readGameLog(label: string, specIndex: number, replicaIndex: number): GameLog | null {
  try {
    const raw = readFileSync(join(LOGS_DIR, label, `game-${specIndex}-${replicaIndex}.json`), 'utf8')
    return JSON.parse(raw) as GameLog
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export function writeSummary(label: string, summary: Summary): string {
  return write(label, 'summary.json', summary)
}
