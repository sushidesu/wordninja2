// ── oracle(回答役)──────────────────────────────────────────────
// (単語, 実体, 質問) → はい/いいえ/部分的にそう/わからない。
// プロンプト文は workflow 版から移植。reasoning は観測ログに残す(誤答診断)。
import type { Value } from '../types.ts'
import { ANSWER_SCHEMA, GUESS_VERDICT_SCHEMA, PROFILE_SCHEMA } from './schemas.ts'

export type OracleCall = <T>(args: { prompt: string; schema: object; label: string; model: string }) => Promise<T>

// ゲーム開始時に各語の「実体」を一度だけ確定する。語ごとに安定した referent を
// 持たせ、場当たり回答による誤答・非整合を防ぐ(oracle はこれに一貫して照らす)。
export async function profileWord(call: OracleCall, word: string, model: string): Promise<string> {
  const r = await call<{ profile: string }>({
    prompt: [
      `「${word}」という単語について、事実に基づき簡潔に記述してください。`,
      '(1) この語が指す最も自然な意味・実体は何か。',
      '(2) 広く知られた主要な性質(分類、物理的な状態・形、どこにある/いつ現れる、見え方など)。',
      '知らない・自信がない場合は調べた上で、2〜4文でまとめてください。',
    ].join('\n'),
    schema: PROFILE_SCHEMA,
    label: 'oracle:実体',
    model,
  })
  return r.profile
}

export async function answerQuestion(
  call: OracleCall,
  word: string,
  profile: string,
  question: string,
  model: string,
): Promise<{ value: Value; reasoning: string }> {
  return call<{ value: Value; reasoning: string }>({
    prompt: [
      'あなたは事実判定器です。ある単語と、その実体、そして質問が与えられます。',
      `単語: 「${word}」`,
      `この単語の実体: ${profile}`,
      `質問: 「${question}」`,
      '即答せず、まず reasoning で考えてから答えてください: (1) この問いはこの単語について何を問うているか、(2) その性質は単語の定義的・顕著な特徴か、それとも周辺的・技術的な事柄か、(3) はい/いいえ のどちらかが単語の正体を誤って伝えないか。',
      'そのうえで、上の実体に照らして質問に当てはまるなら「はい」、当てはまらないなら「いいえ」と答える。字義的には真でも、周辺的な事実で単語の正体を誤って伝える答えは避ける。',
      '複数の意味・側面を持ち、ある側面では当てはまるが別の側面では当てはまらない場合は「部分的にそう」。',
      '知らない・自信がない場合は調べた上で正確に。どうしても はい・いいえ が定まらない場合のみ「わからない」。',
      '明確なときは「はい」「いいえ」に倒す。戦略や誘導はせず、正確さのためだけに考える。',
    ].join('\n'),
    schema: ANSWER_SCHEMA,
    label: 'oracle:回答',
    model,
  })
}

// 推測の正誤も、単語の持ち主(oracle)が判定する。表記揺れ・読み・別名を吸収する。
export async function judgeGuess(
  call: OracleCall,
  word: string,
  guessWord: string,
  model: string,
): Promise<{ correct: boolean; reasoning: string }> {
  const r = await call<{ value: 'はい' | 'いいえ'; reasoning: string }>({
    prompt: [
      `あなたは「${word}」という単語を持っています。`,
      `相手があなたの単語を「${guessWord}」だと推測しました。`,
      `「${guessWord}」は、あなたの単語「${word}」と同じものを指していますか?`,
      '表記の違い(ひらがな・カタカナ・漢字)、読み、一般的な別名・同義語は「同じ(はい)」とみなしてください。',
      '明確に別の単語を指す場合は「いいえ」と答えてください。',
    ].join('\n'),
    schema: GUESS_VERDICT_SCHEMA,
    label: 'oracle:推測判定',
    model,
  })
  return { correct: r.value === 'はい', reasoning: r.reasoning }
}
