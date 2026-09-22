// お題ペアの生成(種ベース co-member 框組み: docs/adr/0004)と screen 投入。
// - 種語をランダム抽出し、各種語をペアの片側に固定して co-member を挙げさせる
// - few-shot は毎回サンプル(固定すると mode collapse する)
// - topics の /api/screen が重複・近すぎ(埋め込み距離)を排除し、通過分を
//   未評価 topic として DB に登録して topicId を返す
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { addUsage, callLlm, emptyUsage } from '../llm.ts'
import type { LlmUsage } from '../types.ts'
import { SYSTEM_PROMPT } from './game.ts'

// 人ラベル付き事例(出典: packages/server/scripts/seed-fewshot.py = rubric v4 の蓄積ラベル)
export const RATED_5: [string, string][] = [
  ['ペンギン', 'ダチョウ'], ['医者', '消防士'], ['桜', 'ひまわり'], ['お城', '灯台'],
  ['自転車', 'ヘリコプター'], ['ろうそく', '氷'], ['雪だるま', 'かかし'],
]
export const RATED_4: [string, string][] = [
  ['風船', '潜水艦'], ['納豆', 'ヨーグルト'], ['筆', 'クレヨン'], ['井戸', '噴水'],
  ['ラクダ', 'サボテン'], ['ピアノ', 'ハープ'], ['卓球', 'ボクシング'], ['傘', '手袋'],
]
export const RATED_BAD: { pair: [string, string]; reason: string }[] = [
  { pair: ['うどん', 'パスタ'], reason: '近すぎ(同じ麺類でほぼ隣同士。質問で区別する面白さがない)' },
  { pair: ['風鈴', '鈴'], reason: '近すぎ(片方がもう片方の一種)' },
  { pair: ['飛行機', '船'], reason: '近すぎ(乗り物同士の定番比較)' },
  { pair: ['時計', 'カレンダー'], reason: '予測可能(時間つながりが自明)' },
  { pair: ['うちわ', '扇風機'], reason: '予測可能(機能が同じで連想が直結)' },
  { pair: ['磁石', '人気者'], reason: '遠すぎ/比喩(字義通りの共通点がない)' },
  { pair: ['ストロー', '象の鼻'], reason: '意味不明(形の連想だけ)' },
  { pair: ['種', 'アイデア'], reason: '比喩(抽象と具体の掛詞)' },
]

export function sample<T>(arr: T[], n: number): T[] {
  const pool = [...arr]
  const out: T[] = []
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return out
}

let seedsCache: string[] | null = null
export function loadSeeds(): string[] {
  if (!seedsCache) {
    seedsCache = readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'topics', 'data', 'seed-words.txt'), 'utf8')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return seedsCache
}

const PAIRS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          a: { type: 'string', description: '種語(そのまま使う)' },
          b: { type: 'string', description: '相方(別の具体物1語。併記・括弧の補足を付けない)' },
          category: { type: 'string', description: '2語が属する非自明な共通カテゴリ(短く)' },
          self: { type: 'integer', description: '自己評価 1-5' },
        },
        required: ['a', 'b', 'category', 'self'],
      },
    },
  },
  required: ['pairs'],
}

export type GeneratedPair = { pair: [string, string]; category: string }

export async function generatePairs(
  model: string,
  seedCount: number,
  avoid?: { words?: string[]; categories?: string[] },
): Promise<{ pairs: GeneratedPair[]; usage: LlmUsage }> {
  // 採用済みの語は種からも除く(同じ語が複数ペアに載るのを防ぐ)
  const avoidWords = new Set(avoid?.words ?? [])
  const seeds = sample(loadSeeds().filter((s) => !avoidWords.has(s)), seedCount)
  const good = sample([...RATED_5, ...RATED_4], 4)
  const bad = sample(RATED_BAD, 4)
  const usage = emptyUsage()
  const r = await callLlm<{ pairs: { a: string; b: string; category: string; self: number }[] }>({
    model,
    systemPrompt: SYSTEM_PROMPT,
    schema: PAIRS_SCHEMA,
    label: `generate(${seeds.slice(0, 3).join(',')}…)`,
    prompt: [
      'パーティゲーム「ワードニンジャ」のお題ペアを作ります。2人のプレイヤーがそれぞれ片方の単語を持ち、Yes/No 質問で相手の単語を当て合います。',
      '良いペアの条件: 2語が「非自明だが字義通りの具体的な共通カテゴリ」に属する、互いに異なる具体物であること。言い換え・付随物・連想・比喩は不可。日常語彙で、どちらの語も当てられ得ること。',
      '',
      '良い例: ' + good.map(([a, b]) => `${a}×${b}`).join('、'),
      '悪い例:',
      ...bad.map((x) => `- ${x.pair[0]}×${x.pair[1]}: ${x.reason}`),
      '',
      '次の各「種語」をペアの片側(a)にそのまま使い、相方(b)として「種語と同じ非自明な具体カテゴリに属する別の具体物」を1語挙げてください。良い相方が見つからない種語はスキップして構いません。',
      '種語: ' + seeds.join('、'),
      ...(avoid?.words?.length ? ['使用済みの語(b に使わない): ' + avoid.words.join('、')] : []),
      ...(avoid?.categories?.length
        ? ['採用済みのカテゴリ(プールの多様性のため、これらと同種のカテゴリは避ける): ' + avoid.categories.join(' / ')]
        : []),
      '各ペアに category(共通カテゴリを短く)と self(自己評価1-5)を付けてください。',
    ].join('\n'),
  })
  addUsage(usage, r.usage)
  const pairs = (r.data.pairs ?? [])
    .filter((p) => p.a && p.b && p.self >= 3 && !avoidWords.has(p.b.trim()))
    .map((p) => ({ pair: [p.a.trim(), p.b.trim()] as [string, string], category: p.category?.trim() ?? '' }))
  return { pairs, usage }
}

export type ScreenedPair = { pair: [string, string]; topicId: string }

// screen は Workers AI(埋め込み)経由で、長時間稼働の wrangler dev が
// InferenceUpstreamError を返し出すことがある(実測)。一時障害はクールダウンを
// 挟んで再試行する。
const SCREEN_RETRY_WAITS_MS = [0, 60_000, 300_000]

export async function screenPairs(
  baseUrl: string,
  pairs: [string, string][],
): Promise<{ kept: ScreenedPair[]; near: number; dup: number }> {
  let lastError: Error = new Error('unreachable')
  for (const wait of SCREEN_RETRY_WAITS_MS) {
    if (wait > 0) {
      console.error(`⚠ screen API 失敗 → ${wait / 1000}s 待って再試行: ${lastError.message.split('\n')[0]}`)
      await new Promise((r) => setTimeout(r, wait))
    }
    try {
      const res = await fetch(baseUrl + '/api/screen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pairs }),
      })
      if (!res.ok) throw new Error(`screen API ${res.status}: ${await res.text()}`)
      const j = (await res.json()) as { kept: { words: string[]; id: string }[]; near: unknown[]; dup: unknown[] }
      return {
        kept: j.kept.map((k) => ({ pair: [k.words[0], k.words[1]] as [string, string], topicId: k.id })),
        near: j.near.length,
        dup: j.dup.length,
      }
    } catch (e) {
      lastError = e as Error
    }
  }
  throw lastError
}

export async function postEvaluation(
  baseUrl: string,
  topicId: string,
  evaluator: string,
  rating: number,
): Promise<void> {
  const res = await fetch(baseUrl + '/api/evaluations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topicId, evaluator, rating }),
  })
  if (!res.ok) throw new Error(`evaluations API ${res.status}: ${await res.text()}`)
}
