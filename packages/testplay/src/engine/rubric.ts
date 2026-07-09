// 概念審査(rubric v4 準拠): ペアの「概念としての良さ」を 1-5 で採点する。
// judge(プレイ性)と直交する軸——近すぎ・予測可能・比喩などは judge では
// 検出できない(うどん×パスタはプレイ性なら好成績)ことが校正実験で確認済み。
// 採点は docs/odai-rubric-v4.md の方針に従い、人ラベル済み事例との類推で行う。
import { addUsage, callLlm, emptyUsage } from '../llm.ts'
import type { LlmUsage } from '../types.ts'
import { SYSTEM_PROMPT } from './game.ts'
import { RATED_4, RATED_5, RATED_BAD, sample } from './generate.ts'

const RUBRIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ratings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer', description: '対象ペアの番号(1始まり)' },
          rating: { type: 'integer', description: '1-5(5=とても良い)' },
          reason: { type: 'string', description: '判定理由を短く(どの事例に近いか)' },
        },
        required: ['index', 'rating', 'reason'],
      },
    },
  },
  required: ['ratings'],
}

export type RubricResult = { pair: [string, string]; rating: number; reason: string }

export async function rubricReview(
  pairs: [string, string][],
  model: string,
): Promise<{ results: RubricResult[]; usage: LlmUsage }> {
  const usage = emptyUsage()
  const results: RubricResult[] = []
  // 1コールあたり最大10ペア。few-shot は毎回サンプル(mode collapse 防止)
  for (let i = 0; i < pairs.length; i += 10) {
    const chunk = pairs.slice(i, i + 10)
    const good5 = sample(RATED_5, 3)
    const good4 = sample(RATED_4, 3)
    const bad = sample(RATED_BAD, 5)
    const r = await callLlm<{ ratings: { index: number; rating: number; reason: string }[] }>({
      model,
      systemPrompt: SYSTEM_PROMPT,
      schema: RUBRIC_SCHEMA,
      label: `rubric(${chunk[0].join('×')}…${chunk.length}件)`,
      prompt: [
        'パーティゲーム「ワードニンジャ」のお題ペア(2語)を審査します。2人がそれぞれ片方の単語を持ち、Yes/No 質問で相手の単語を当て合うゲームです。',
        '評価の観点(重要な順):',
        '- 字義通りの共通点: 2語が比喩や連想でなく、事実として共通の性質・カテゴリを持つ',
        '- カテゴリの非自明性: その共通カテゴリが「言われると納得だが、すぐには思いつかない」',
        '- 区別性: 2語が近すぎない(片方がもう片方の一種・定番の同類・機能の言い換えは不可)',
        '- 一般性: どちらも日常語彙で、大人なら誰でも知っている',
        '',
        '採点済みの事例(この基準との類推で採点すること):',
        ...good5.map(([a, b]) => `- ${a}×${b}: 5(とても良い)`),
        ...good4.map(([a, b]) => `- ${a}×${b}: 4(良い・惜しい)`),
        ...bad.map((x) => `- ${x.pair[0]}×${x.pair[1]}: 2(${x.reason})`),
        '',
        '審査対象:',
        ...chunk.map((p, j) => `${j + 1}. ${p[0]}×${p[1]}`),
        '各ペアに rating(1-5)と reason を付けてください。迷ったら事例のどれに一番近いかで決めること。',
      ].join('\n'),
    })
    addUsage(usage, r.usage)
    for (const x of r.data.ratings ?? []) {
      const p = chunk[x.index - 1]
      if (p) results.push({ pair: p, rating: x.rating, reason: x.reason })
    }
  }
  return { results, usage }
}
