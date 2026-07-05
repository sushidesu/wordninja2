// ── お題の直接測定(ゲーム非経由の判定器)──────────────────────────
// フルゲームの繰り返しは「お題の質」の推定器として高コスト・高分散で、エンジン起因の
// 誤差がお題側の欠陥と区別できない。ここでは質を決める量を分解して直接測る:
//   1. 到達性   — 自語 A を持つ側の初期候補分布に相手語 B が現れる順位(テーマ事前の強さ)
//   2. 弁別性   — B を候補集合から Yes/No 質問で孤立させるのに要する理想質問数(貪欲 EIG)
//   3. 回答安定性 — B への質問に対する oracle 回答の hedge 率・再サンプル不一致率(語の曖昧さ)
//   4. 対称性   — 上記を両方向で測る
// 1お題 ~40 コールで、ゲーム(~50コール×リプリカ)より安く低分散。実ゲームは校正用に残す。
import { addUsage, callLlm, emptyUsage } from '../llm.ts'
import type { Candidate, LlmUsage, Model, Value } from '../types.ts'
import { GUESS_THRESHOLD, bayesUpdate, dedupeReadout, eig, type PredictionRow } from './belief.ts'
import { wordParts } from './belief.ts'
import { SYSTEM_PROMPT } from './game.ts'
import { profileWord } from './oracle.ts'
import { BELIEF_SCHEMA, QUESTIONS_SCHEMA, SIM_SCHEMA, ANSWER_SCHEMA } from './schemas.ts'

export type DirectionProbe = {
  seekerWord: string
  targetWord: string
  reachability: {
    /** サンプルごとの相手語の順位(1始まり、不在は null) */
    ranks: (number | null)[]
    inTopRate: number
    meanReciprocalRank: number
    /** 診断用: 各サンプルの候補語(正準化後) */
    samples: string[][]
  }
  discriminability: {
    candidateSetSize: number
    /** 貪欲 EIG で B の事後が GUESS_THRESHOLD を超えるまでの質問数(不能は null) */
    idealQuestions: number | null
    /** 打ち切り時の B の最終事後と順位(孤立に至らない場合の連続量) */
    targetFinalProb: number
    targetFinalRank: number
    questionsUsed: string[]
  }
  answerability: {
    /** 部分的にそう/わからない の割合 */
    hedgeRate: number
    /** 同一質問の再サンプルで回答が食い違った割合 */
    inconsistencyRate: number
  }
  /** 予測トータル手数 ≈ 2 × 理想質問数 ÷ (1 − hedge率)。到達不能・孤立不能は null */
  predictedTurns: number | null
}

export type PairProbe = {
  pair: [string, string]
  directions: [DirectionProbe, DirectionProbe]
  asymmetry: number | null
  usage: LlmUsage
}

export type ProbeConfig = {
  proberModel: Model
  answererModel: Model
  reachSamples: number // 到達性のサンプル数(既定5)
  stabilityQuestions: number // 回答安定性に使う質問数(既定6、各2サンプル)
}

type Call = <T>(args: { prompt: string; schema: object; label: string; model: string }) => Promise<T>

const SYNONYMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { synonyms: { type: 'array', items: { type: 'string' } } },
  required: ['synonyms'],
}

// 対象語の同義語集合。同一性の基準をゲーム側(oracle は 喫茶店=カフェ を正解と
// 判定する)と揃えるため、文字列一致でなく同義語込みで照合する。
async function synonymSetOf(call: Call, word: string, model: string): Promise<Set<string>> {
  const r = await call<{ synonyms: string[] }>({
    prompt: [
      `「${word}」と同じ対象を指す、一般的な別名・言い換え・表記ゆれ(ひらがな・カタカナ・漢字)を最大8個挙げてください。`,
      '別の対象を指す語(上位概念・下位概念・近縁の別物)は含めないでください。',
    ].join('\n'),
    schema: SYNONYMS_SCHEMA,
    label: `probe:同義語 ${word}`,
    model,
  })
  return new Set([word, ...(r.synonyms ?? []).map((s) => s.trim()).filter(Boolean)])
}

const matchesSet = (w: string, set: Set<string>) => set.has(w) || wordParts(w).some((p) => set.has(p))

async function probeDirection(
  call: Call,
  seekerWord: string,
  targetWord: string,
  cfg: ProbeConfig,
  targetProfile: string,
  targetSet: Set<string>,
): Promise<DirectionProbe> {
  // 1. 到達性: ゲーム開始時点(事実なし)の候補読み出しを N 回サンプル。
  //    文言はゲームの候補提案プロンプトと揃える(測定器と実プロセスの一致)。
  //    特に多様性条項が無いと1つの狭いテーマ解釈に固まり、到達率を過小評価する。
  const reachPrompt = [
    'あなたはパーティゲーム「ワードニンジャ」の参加者で、相手プレイヤーの秘密の単語を当てようとしています。',
    `すべての単語は共通のテーマで選ばれています。あなた自身の単語は「${seekerWord}」で、相手の単語とテーマで結ばれています(手がかり)。`,
    'まだ質問はしていません。この時点で「相手の単語」の候補を、ありそうな順に最大12語、各語に相対的なもっともらしさ(合計約1.0)を付けて挙げてください。',
    '候補リストの条件:',
    '- 各候補は互いに明確に異なる概念にする。同じ対象の言い換え・同義語や、ある一般概念に含まれる具体例・商品名・ブランド名は候補に併記せず、最も一般的で代表的な語ひとつに統合する。',
    '- ありふれた一般名詞を優先し、固有名詞や過度に限定的な語は避ける。',
    '- 異なる系統・カテゴリにわたる多様な候補を含める(ひとつの領域に偏らせない)。',
  ].join('\n')
  const samples = await Promise.all(
    Array.from({ length: cfg.reachSamples }, (_, i) =>
      call<{ candidates: Candidate[] }>({
        prompt: reachPrompt,
        schema: BELIEF_SCHEMA,
        label: `probe:到達性 ${seekerWord}→? #${i + 1}`,
        model: cfg.proberModel,
      }),
    ),
  )
  const sampleLists = samples.map((s) => dedupeReadout(s.candidates ?? [], new Set()))
  const ranks = sampleLists.map((list) => {
    const idx = list.findIndex((c) => matchesSet(c.word, targetSet))
    return idx >= 0 ? idx + 1 : null
  })
  const inTopRate = ranks.filter((r) => r != null).length / (ranks.length || 1)
  const meanReciprocalRank = ranks.reduce<number>((a, r) => a + (r ? 1 / r : 0), 0) / (ranks.length || 1)

  // 候補集合 = 全サンプルの和集合(正準化)。B が居なければ注入(孤立コストは B が
  // 集合に居る前提の量。到達性の悪さは 1. が既に捉えている)。
  const union = dedupeReadout(
    samples.flatMap((s) => s.candidates ?? []),
    new Set(),
  ).slice(0, 15)
  if (!union.some((c) => matchesSet(c.word, targetSet))) union.push({ word: targetWord, prob: 0.05 })
  const words = union.map((c) => c.word)

  // 2. 弁別性: 質問生成 → 予想グリッド → 貪欲 EIG で B を孤立させる理想手数
  const qgen = await call<{ questions: string[] }>({
    prompt: [
      'あなたはパーティゲーム「ワードニンジャ」の質問者です。相手の秘密の単語を、はい/いいえ で答えられる質問で絞り込みます。',
      '相手の単語の候補:',
      words.map((w, i) => `${i + 1}. ${w}`).join('\n'),
      'この候補集合を効率よく絞り込む Yes/No 質問を10個作ってください。まず機能・カテゴリの大きな二分、その後に細部。互いに異なる観点にし、候補語そのものを文に挙げない。誰が答えても同じになる、具体的で日常的な性質を問うこと。',
    ].join('\n'),
    schema: QUESTIONS_SCHEMA,
    label: `probe:弁別性/質問 ${seekerWord}→${targetWord}`,
    model: cfg.proberModel,
  })
  const questions = (qgen.questions ?? []).filter((q) => q && q.trim()).slice(0, 10)
  const sim = await call<{ grid: { question_index: number; answers: { word_index: number; value: Value }[] }[] }>({
    prompt: [
      '次の各質問について、各候補語がどう答えるかを予想してください(その語の一般的な性質に基づき正確に。はい/いいえ/部分的にそう/わからない)。',
      'その語の通常の・典型的な姿で判断し、明確なときは「はい」「いいえ」に倒してください。質問は日常会話の意味で解釈してください。',
      '候補語(word_index はこの番号):',
      words.map((w, i) => `${i + 1}. ${w}`).join('\n'),
      '質問(question_index はこの番号):',
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      'grid に、質問ごと(question_index)に全候補語(word_index)の予想回答を入れてください。',
    ].join('\n'),
    schema: SIM_SCHEMA,
    label: `probe:弁別性/予想 ${seekerWord}→${targetWord}`,
    model: cfg.proberModel,
  })
  const rows: PredictionRow[] = questions.map(() => ({}))
  for (const g of sim.grid ?? []) {
    const qi = g.question_index - 1
    if (qi < 0 || qi >= questions.length) continue
    for (const a of g.answers ?? []) {
      const w = words[a.word_index - 1]
      if (w) rows[qi][w] = a.value
    }
  }
  // 一様事前から、B の予想どおりに回答が返る想定で貪欲に EIG 最大の質問を消費する
  const targetInSet = words.find((w) => matchesSet(w, targetSet)) ?? targetWord
  let belief: Candidate[] = words.map((w) => ({ word: w, prob: 1 / words.length }))
  const unused = new Set(rows.keys())
  const questionsUsed: string[] = []
  let idealQuestions: number | null = null
  for (let step = 1; step <= questions.length; step++) {
    let bestQi = -1
    let bestE = -Infinity
    for (const qi of unused) {
      const e = eig(rows[qi], belief)
      if (e > bestE) {
        bestE = e
        bestQi = qi
      }
    }
    if (bestQi < 0 || bestE <= 1e-9) break // これ以上情報が取れない
    unused.delete(bestQi)
    questionsUsed.push(questions[bestQi])
    const observed = rows[bestQi][targetInSet] ?? 'わからない'
    bayesUpdate(belief, rows[bestQi], observed)
    const top = [...belief].sort((a, b) => b.prob - a.prob)[0]
    if (matchesSet(top.word, targetSet) && top.prob >= GUESS_THRESHOLD) {
      idealQuestions = step
      break
    }
  }
  // 孤立に至らなくても「どこまで寄れたか」を連続量で残す(∞同士の比較を可能に)
  const finalSorted = [...belief].sort((a, b) => b.prob - a.prob)
  const finalIdx = finalSorted.findIndex((c) => matchesSet(c.word, targetSet))
  const targetFinalProb = finalIdx >= 0 ? Math.round(finalSorted[finalIdx].prob * 1000) / 1000 : 0
  const targetFinalRank = finalIdx >= 0 ? finalIdx + 1 : words.length

  // 3. 回答安定性: 先頭の質問 K 個 × 2 サンプルを oracle(B)に実際に答えさせる
  const stabilityQs = questions.slice(0, cfg.stabilityQuestions)
  const answerOnce = (q: string, sampleIdx: number) =>
    call<{ value: Value; reasoning: string }>({
      prompt: [
        'あなたは事実判定器です。ある単語と質問が与えられます。',
        `単語: 「${targetWord}」`,
        `参考 — この単語が指す対象: ${targetProfile}`,
        `質問: 「${q}」`,
        '質問は、ふつうの人が日常会話で使う意味で解釈し、対象の通常の・典型的な姿で判断してください。明確なときは「はい」「いいえ」に倒す。「部分的にそう」は対象が本質的に複数の顔を持つ場合のみ。',
      ].join('\n'),
      schema: ANSWER_SCHEMA,
      label: `probe:安定性 ${targetWord} q${sampleIdx}`,
      model: cfg.answererModel,
    })
  const pairsOfAnswers = await Promise.all(
    stabilityQs.map(async (q, i) => {
      const [a, b] = await Promise.all([answerOnce(q, i * 2), answerOnce(q, i * 2 + 1)])
      return [a.value, b.value] as const
    }),
  )
  const flat = pairsOfAnswers.flat()
  const fuzzy = (v: Value) => v === '部分的にそう' || v === 'わからない'
  const hedgeRate = flat.length ? flat.filter(fuzzy).length / flat.length : 0
  const inconsistencyRate = pairsOfAnswers.length
    ? pairsOfAnswers.filter(([a, b]) => a !== b).length / pairsOfAnswers.length
    : 0

  // 合成: 交互手番なので自分の質問は2手に1回。hedge は1問あたりの実効情報を薄める。
  const predictedTurns =
    idealQuestions != null ? Math.round(((2 * idealQuestions) / Math.max(1 - hedgeRate, 0.25)) * 10) / 10 : null

  return {
    seekerWord,
    targetWord,
    reachability: {
      ranks,
      inTopRate: Math.round(inTopRate * 100) / 100,
      meanReciprocalRank: Math.round(meanReciprocalRank * 100) / 100,
      samples: sampleLists.map((l) => l.map((c) => c.word)),
    },
    discriminability: {
      candidateSetSize: words.length,
      idealQuestions,
      targetFinalProb,
      targetFinalRank,
      questionsUsed,
    },
    answerability: {
      hedgeRate: Math.round(hedgeRate * 100) / 100,
      inconsistencyRate: Math.round(inconsistencyRate * 100) / 100,
    },
    predictedTurns,
  }
}

export async function probePair(pair: [string, string], cfg: ProbeConfig): Promise<PairProbe> {
  const usage = emptyUsage()
  const call: Call = async (args) => {
    const r = await callLlm<any>({ ...args, systemPrompt: SYSTEM_PROMPT })
    addUsage(usage, r.usage)
    return r.data
  }
  // 語の実体(oracle の referent 固定用)は方向に依らないので先に2語ぶん
  const [profA, profB, setA, setB] = await Promise.all([
    profileWord(call, pair[0], cfg.answererModel),
    profileWord(call, pair[1], cfg.answererModel),
    synonymSetOf(call, pair[0], cfg.proberModel),
    synonymSetOf(call, pair[1], cfg.proberModel),
  ])
  const [d1, d2] = await Promise.all([
    probeDirection(call, pair[0], pair[1], cfg, profB, setB), // A を持つ側が B を当てる
    probeDirection(call, pair[1], pair[0], cfg, profA, setA), // B を持つ側が A を当てる
  ])
  const asymmetry =
    d1.predictedTurns != null && d2.predictedTurns != null
      ? Math.round(Math.abs(d1.predictedTurns - d2.predictedTurns) * 10) / 10
      : null
  return { pair, directions: [d1, d2], asymmetry, usage }
}
