#!/usr/bin/env node
// テストプレイのログを決定的に保存する(LLM不要・素の fs)。
// 使い方: node persist.mjs <logLabel> <fileName> [requiredKey ...]   (JSON 本文は標準入力)
//   → リポジトリ直下の logs/<logLabel>/<fileName> に書き、読み戻して JSON 検証する。
//   成功: 終了コード0 + 標準出力 "OK <path>" / 失敗: 非0 + 標準エラーに理由。
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [label, file, ...requiredKeys] = process.argv.slice(2)
const unsafe = (s) => !s || /[/\\]|\.\./.test(s)
if (unsafe(label) || unsafe(file)) {
  console.error('invalid label/file (/, \\, .. は不可)')
  process.exit(2)
}

let raw
try {
  raw = readFileSync(0, 'utf8') // stdin
} catch (e) {
  console.error('stdin read failed: ' + e.message)
  process.exit(3)
}

let obj
try {
  obj = JSON.parse(raw)
} catch (e) {
  console.error('input is not valid JSON: ' + e.message)
  process.exit(4)
}
for (const k of requiredKeys) {
  if (!(k in obj)) {
    console.error('missing required key: ' + k)
    process.exit(5)
  }
}

const dir = resolve(process.cwd(), 'logs', label)
const path = join(dir, file)
mkdirSync(dir, { recursive: true })
writeFileSync(path, JSON.stringify(obj, null, 2)) // 正規化して書く(LLMの空白差は無関係)

// 読み戻し検証
try {
  const back = JSON.parse(readFileSync(path, 'utf8'))
  for (const k of requiredKeys) {
    if (!(k in back)) {
      console.error('verify failed: missing key after write: ' + k)
      process.exit(6)
    }
  }
} catch (e) {
  console.error('verify failed: re-read parse error: ' + e.message)
  process.exit(7)
}

console.log('OK ' + path)
