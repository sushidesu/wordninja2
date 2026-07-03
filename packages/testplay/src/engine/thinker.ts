// ── thinker(質問者側の意思決定)────────────────────────────────────
// externalized: 候補提案・質問生成・回答予想を LLM に分担させ、選択(EIG 最大)
// と確率(信念)はコードが持つ。light: 1コールで次の一手を直接決める。
// プロンプト文は workflow 版から一字一句移植(挙動を変えない)。
import type { Candidate, Player, PlayMode, Value, Move, ScoredQuestion } from '../types.ts'
import { GUESS_THRESHOLD, argmax, eig, reconcileSupport, type PredictionRow } from './belief.ts'
import { BELIEF_SCHEMA, LIGHT_MOVE_SCHEMA, QUESTIONS_SCHEMA, SIM_SCHEMA } from './schemas.ts'

export const PREMISE = [
  'あなたはパーティゲーム「ワードニンジャ」をプレイしています。',
  '各プレイヤーには秘密の単語が1つ割り当てられています。すべての単語は何らかの共通のテーマに沿って選ばれています。',
  'あなたの目的は、Yes/Noで答えられる質問を重ねて、相手プレイヤーの単語を特定することです。',
  'これは早当て勝負です。相手も同時にあなたの単語を当てようとしており、先に相手の単語を正しく言い当てた方が勝ちます。',
  '',
  '【重要なルール】誰かが質問すると、相手プレイヤーが「自分自身の単語」について はい/いいえ で答えます。',
  'つまり各回答は「答えた人の単語」を表します。あなたが相手の単語を当てる手がかりになるのは、',
  '"あなたが質問して相手が答えたもの" だけです。あなたが答えた回答は、あなた自身の単語の情報なので相手当てには使えません。',
].join('\n')

const opponentOf = (p: Player): Player => (p === 1 ? 2 : 1)

// プレイヤー視点で「相手当てに使える情報」と「自分が聞かれたこと」を分離して描画。
export function renderForPlayer(transcript: Move[], player: Player): string {
  const opp = opponentOf(player)
  const aboutOpponent: string[] = []
  const aboutSelf: string[] = []
  const guesses: string[] = []
  for (const e of transcript) {
    if (e.kind === 'guess') {
      guesses.push(`プレイヤー${e.asker}が「${e.word}」と推測 → ${e.correct ? '正解' : '不正解'}`)
      continue
    }
    const line = `「${e.text}」→ ${e.answer}`
    if (e.asker === player) aboutOpponent.push(line)
    else aboutSelf.push(line)
  }
  const sec = (title: string, arr: string[]) =>
    `${title}\n` + (arr.length ? arr.map((l, i) => `  ${i + 1}. ${l}`).join('\n') : '  (まだなし)')
  return [
    sec(`【相手(プレイヤー${opp})の単語について判明していること】(あなたが質問し相手が答えた)`, aboutOpponent),
    '',
    sec('【あなたの単語について相手が質問してきたこと】(参考・相手当てには無関係)', aboutSelf),
    '',
    sec('【これまでの推測】', guesses),
  ].join('\n')
}

// game.ts が注入するコール関数(役割別 usage 集計を隠蔽)
export type ThinkerCall = <T>(args: { prompt: string; schema: object; label: string; model: string }) => Promise<T>

export type ThinkerDecision =
  | {
      kind: 'question'
      text: string
      reasoning: string
      belief: Candidate[]
      /** 採用質問への各候補の予想回答(ベイズ更新の尤度源・観測ログにそのまま残す) */
      predictions: PredictionRow
      questions: ScoredQuestion[]
    }
  | { kind: 'guess'; word: string; reasoning: string; belief: Candidate[] }

// light モード: 1コールで次の一手を直接決める(信念・EIG を持たない)
export async function decideLight(
  call: ThinkerCall,
  transcript: Move[],
  player: Player,
  myWord: string,
  model: string,
  rejected: Set<string>,
): Promise<{ kind: 'question' | 'guess'; content: string; reasoning: string }> {
  const known = renderForPlayer(transcript, player)
  const lines = [
    PREMISE,
    `あなたはプレイヤー${player}。あなた自身の単語は「${myWord}」で、相手の単語とは共通テーマで結ばれています(手がかり)。`,
    '相手の単語について、あなたが質問して判明した事実:',
    known,
  ]
  if (rejected.size) lines.push('既に外した推測(もう選ばない): ' + [...rejected].join('、'))
  lines.push(
    '次の一手を1つ決めてください。まだ相手の単語を一つに絞れていないなら、可能性を最も効率よく二分する Yes/No 質問を投げる。十分に確信できるなら、その単語を推測して勝ちにいく(早当て勝負)。',
    '質問を選ぶ場合は、誰が答えても同じになる具体的で自然な一文にし、候補語の列挙や「(A・B を分ける)」のような補足は入れない。',
    'kind に "question" か "guess"、content に質問文または推測する単語を入れてください。',
  )
  const res = await call<{ kind: 'question' | 'guess'; content: string; reasoning?: string }>({
    prompt: lines.join('\n'),
    schema: LIGHT_MOVE_SCHEMA,
    label: `P${player}:一手`,
    model,
  })
  const content = String(res.content ?? '').trim()
  if (!content) throw new Error(`light move returned empty content (P${player})`)
  return { kind: res.kind, content, reasoning: res.reasoning ?? 'light' }
}

// externalized モード: 1手ぶんの意思決定。返り値の belief は呼び出し側が保持し、
// oracle 回答後に bayesUpdate で事後へ更新する。grid は更新に使う質問×語の予測表。
export async function decide(
  call: ThinkerCall,
  belief: Candidate[],
  transcript: Move[],
  player: Player,
  myWord: string,
  model: string,
  rejected: Set<string>,
): Promise<ThinkerDecision> {
  const known = renderForPlayer(transcript, player)

  // ① 支持集合の提案(LLM)。既知事実に矛盾しない語を挙げさせ、コード側の事後と統合。
  //    候補は「互いに異なる代表概念」に限る(同義語併記による事後マスの分裂を防ぐ)。
  const prop = await call<{ candidates: Candidate[] }>({
    prompt: [
      'あなたはパーティゲーム「ワードニンジャ」の参加者で、相手プレイヤーの秘密の単語を当てようとしています。',
      `すべての単語は共通のテーマで選ばれています。あなた自身の単語は「${myWord}」で、相手の単語とテーマで結ばれています(手がかり)。`,
      '相手の単語について、あなたが質問して判明した事実:',
      known,
      '上の事実すべてに矛盾しない「相手の単語」の候補を、ありそうな順に最大12語、各語に相対的なもっともらしさ(合計約1.0)を付けて挙げてください。',
      '候補リストの条件:',
      '- 各候補は互いに明確に異なる概念にする。同じ対象の言い換え・同義語や、ある一般概念に含まれる具体例・商品名・ブランド名は候補に併記せず、最も一般的で代表的な語ひとつに統合する。',
      '- ありふれた一般名詞を優先し、固有名詞や過度に限定的な語は避ける。',
      '- 事実に反しない範囲で、異なる系統・カテゴリにわたる多様な候補を含める(ひとつの領域に偏らせない)。',
    ].join('\n'),
    schema: BELIEF_SCHEMA,
    label: `P${player}:候補`,
    model,
  })
  const proposed = (prop.candidates ?? []).filter((c) => c.word && String(c.word).trim())
  const cands = reconcileSupport(belief, proposed, rejected)
  if (!cands.length) throw new Error(`candidate proposal produced empty support (P${player})`)

  // ② 突出した事後があれば当てに行く(コード判定)
  const total = cands.reduce((a, c) => a + c.prob, 0) || 1
  const top = argmax(cands, (c) => c.prob)!
  if (top.prob / total >= GUESS_THRESHOLD) {
    return { kind: 'guess', word: top.word, reasoning: `事後最大 ${top.word}(${(top.prob / total).toFixed(2)})`, belief: cands }
  }

  // ③ 質問生成(LLM)。狙いは「現在の信念を最も強く弁別する質問」= EIG 最大化。
  //    coarse-to-fine を優先(機能・カテゴリの広い二分を先に、付随属性は後)。
  const qgen = await call<{ questions: string[] }>({
    prompt: [
      'あなたはパーティゲーム「ワードニンジャ」の質問者です。相手の秘密の単語を、はい/いいえ で答えられる質問で絞り込みます。',
      `あなた自身の単語は「${myWord}」。すべての単語は共通テーマで結ばれています(手がかり)。`,
      '相手の単語について、現時点の候補と確からしさ:',
      '<候補>',
      cands.map((c) => `${c.word} (${c.prob.toFixed(2)})`).join('\n'),
      '</候補>',
      'この候補集合を最も強く弁別する Yes/No 質問を8個作ってください。良い質問の条件(重要な順):',
      '- まず「それが根本的に何か・そこで主に何をするか」という機能やカテゴリを問い、可能性を大きく二分する。時間帯・作法・頻度・雰囲気などの付随的な属性は、大きなカテゴリが定まってから細部を詰めるのに使う(粗いカテゴリ → 細部 の順)。',
      '- 候補を「はい」と「いいえ」に大きく二分する(どちらかにほぼ全部が寄る質問は避ける)。確からしさの高い候補の切り分けを優先する。',
      '- 候補が似通った語ばかりのときは、それらを分ける具体的な違い(用途・由来・見え方・形状・場所など)を突く。',
      '- 8問は互いに異なる観点にし、同じ軸の言い換えを重複させない。',
      '<質問文のルール>',
      '- 誰に訊いても同じ答えになる、具体的で日常的な性質を問う(その物/場所が「何をするところか・何を出すか・どこにあるか・何でできているか」など)。抽象的・間接的・派生的な性質や、複数の条件を含む複合的な問い、答えが人によってぶれる曖昧な問いは避ける。',
      '- 一般化した性質を問う、短く自然な一文にする。実際のゲームで人が口にする形。',
      '- 候補語そのものを文に挙げない。「(A・B を分ける)」のような例示・補足を文に含めない。',
      '</質問文のルール>',
    ].join('\n'),
    schema: QUESTIONS_SCHEMA,
    label: `P${player}:質問案`,
    model,
  })
  const questions = (qgen.questions ?? []).filter((q) => q && String(q).trim())
  if (!questions.length) throw new Error(`question generation produced no questions (P${player})`)

  // ④ 回答シミュレーション(LLM生成、質問×支持集合)。EIG 計算とベイズ更新の尤度源。
  //    質問・候補語は番号で参照させ、コード側で正準の語に引き直す(echo 照合を排除)。
  const sim = await call<{ grid: { question_index: number; answers: { word_index: number; value: Value }[] }[] }>({
    prompt: [
      '次の各質問について、各候補語がどう答えるかを予想してください(その語の一般的な性質に基づき正確に。はい/いいえ/部分的にそう/わからない)。',
      '候補語(word_index はこの番号):',
      cands.map((c, i) => `${i + 1}. ${c.word}`).join('\n'),
      '質問(question_index はこの番号):',
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      'grid に、質問ごと(question_index)に全候補語(word_index)の予想回答を入れてください。',
    ].join('\n'),
    schema: SIM_SCHEMA,
    label: `P${player}:予想`,
    model,
  })
  // 正規化: rows[質問idx] = { 語(正準表記) → 予想値 }
  const rows: PredictionRow[] = questions.map(() => ({}))
  for (const g of sim.grid ?? []) {
    const qi = g.question_index - 1
    if (qi < 0 || qi >= questions.length) continue
    for (const a of g.answers ?? []) {
      const c = cands[a.word_index - 1]
      if (c) rows[qi][c.word] = a.value
    }
  }
  // 予想が1件も無い質問は EIG も更新もできないため除外する(silent な誤選択を防ぐ)
  const usable = questions.map((q, i) => ({ text: q, row: rows[i] })).filter((x) => Object.keys(x.row).length > 0)
  if (!usable.length) throw new Error(`answer simulation covered no questions (P${player})`)
  if (usable.length < questions.length) {
    console.warn(`⚠ P${player}: 予想が欠けた質問 ${questions.length - usable.length}/${questions.length} 件を除外`)
  }

  // ⑤ 各質問の EIG をコードで計算し、最大を選ぶ。事後に対する利得なので既出軸は自動で沈む。
  const scored = usable
    .map((x) => ({ ...x, eig: Math.round(eig(x.row, cands) * 1000) / 1000 }))
    .sort((a, b) => b.eig - a.eig)
  const best = scored[0]
  const questionsOut: ScoredQuestion[] = scored.map((s) => ({ text: s.text, eig: s.eig, chosen: s.text === best.text }))
  return {
    kind: 'question',
    text: best.text,
    reasoning: `EIG最大(支持${cands.length}語・質問${usable.length}をコード選択)`,
    belief: cands,
    predictions: best.row,
    questions: questionsOut,
  }
}

export function resolvePlayMode(mode: PlayMode | undefined): PlayMode {
  return mode === 'light' ? 'light' : 'externalized'
}
