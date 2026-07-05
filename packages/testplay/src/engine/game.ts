// ── 1ゲーム = 1お題1リプレイ ─────────────────────────────────────
// 状態はこの関数内に閉じるので並列実行しても干渉しない。進行の事実と
// 「なぜそう動いたか」(oracle の吟味・予測・事後の変化)をすべて transcript に残す。
import { addUsage, callLlm, emptyUsage } from '../llm.ts'
import type {
  Candidate, GameCost, GameLog, Model, Move, Player, PlayerMetrics, PlayMode, QuestionMove, Value,
} from '../types.ts'
import { bayesUpdate, wordParts } from './belief.ts'
import { answerQuestion, judgeGuess } from './oracle.ts'
import { decide, decideLight, decideReadout } from './thinker.ts'

// 全コール共通のシステムプロンプト。同一文字列に保つことで claude -p の
// プロンプトキャッシュ接頭辞(ツール定義+system)が全コールで共有される。
export const SYSTEM_PROMPT =
  'あなたはワードニンジャ(お題当てパーティゲーム)のテストプレイ基盤の一部です。与えられたタスクに正確に答えてください。'

export type GameInstance = {
  pair: [string, string]
  models: Record<Player, Model>
  playModes: Record<Player, PlayMode>
  specIndex: number
  replicaIndex: number
  replicaCount: number
}

export type GameConfig = {
  answererModel: Model
  maxTurnsPerPlayer: number
}

const opponentOf = (p: Player): Player => (p === 1 ? 2 : 1)
const snapshot = (belief: Candidate[]): Candidate[] =>
  belief.map((c) => ({ word: c.word, prob: Math.round(c.prob * 1000) / 1000 }))

// 収束メトリクスを transcript から導出(externalized のみ意味を持つ)
function computeMetrics(transcript: Move[], player: Player, targetWord: string, mode: PlayMode): PlayerMetrics | null {
  if (mode === 'light') return null // light は信念を持たないため導出不能
  // 表記ゆれ(「カフェ・喫茶店」等)を正解語と同一視して判定する。
  // 正準化後の信念では通常は完全一致だが、判定は部品ベースで頑健に。
  const isTarget = (w: string) => w === targetWord || wordParts(w).includes(targetWord)
  let firstIn: number | null = null
  let evictions = 0
  let wasIn = false
  let last: Candidate[] | null = null
  let wrongGuesses = 0
  for (const e of transcript) {
    if (e.asker !== player) continue
    if (e.kind === 'guess' && !e.correct) wrongGuesses++
    // 事後の最終状態を優先(beliefAfter は回答反映後)
    const b = e.kind === 'question' ? (e.beliefAfter ?? e.belief) : e.belief
    if (!b.length) continue
    last = b
    const isIn = b.some((c) => isTarget(c.word))
    if (isIn && firstIn == null) firstIn = e.turn
    if (wasIn && !isIn) evictions++
    wasIn = isIn
  }
  const sorted = last ? [...last].sort((a, b) => b.prob - a.prob) : []
  const idx = sorted.findIndex((c) => isTarget(c.word))
  return {
    targetFirstInSupportTurn: firstIn,
    targetEvictions: evictions,
    targetFinalProb: idx >= 0 ? sorted[idx].prob : null,
    targetFinalRank: idx >= 0 ? idx + 1 : null,
    wrongGuesses,
  }
}

export async function playGame(
  inst: GameInstance,
  config: GameConfig,
  profiles: Record<Player, string>,
): Promise<GameLog> {
  const { pair, models, playModes, specIndex, replicaIndex, replicaCount } = inst
  const words: Record<Player, string> = { 1: pair[0], 2: pair[1] }
  const phase = replicaCount > 1 ? `${pair[0]}×${pair[1]} #${replicaIndex + 1}` : `${pair[0]}×${pair[1]}`

  const cost: GameCost = { ...emptyUsage(), byRole: { thinker: emptyUsage(), oracle: emptyUsage() } }
  const trackedCall =
    (role: 'thinker' | 'oracle') =>
    async <T>(args: { prompt: string; schema: object; label: string; model: string }): Promise<T> => {
      const r = await callLlm<T>({ ...args, systemPrompt: SYSTEM_PROMPT, label: `[${phase}] ${args.label}` })
      addUsage(cost, r.usage)
      addUsage(cost.byRole[role], r.usage)
      return r.data
    }
  const thinkerCall = trackedCall('thinker')
  const oracleCall = trackedCall('oracle')

  const transcript: Move[] = []
  let solved = false
  let winner: Player | null = null
  let totalTurns = 0

  // 各プレイヤーの信念(相手の単語についての事後確率)。ターンをまたいで持続。
  const beliefs: Record<Player, Candidate[]> = { 1: [], 2: [] }
  // 誤推測で棄却された語(「Xか?→いいえ」= P(X)=0)。信念から除外し再推測を防ぐ。
  const rejected: Record<Player, Set<string>> = { 1: new Set(), 2: new Set() }

  for (let round = 0; round < config.maxTurnsPerPlayer && !solved; round++) {
    for (const player of [1, 2] as const) {
      if (solved) break
      totalTurns++
      const mode = playModes[player]
      const opp = opponentOf(player)

      if (mode === 'light' || mode === 'readout') {
        const move =
          mode === 'light'
            ? { ...(await decideLight(thinkerCall, transcript, player, words[player], models[player], rejected[player])), belief: [] as Candidate[] }
            : await decideReadout(thinkerCall, transcript, player, words[player], models[player], rejected[player])
        const belief = snapshot(move.belief)
        if (move.kind === 'guess') {
          const verdict = await judgeGuess(oracleCall, words[opp], move.content, config.answererModel)
          transcript.push({
            turn: totalTurns, asker: player, kind: 'guess', word: move.content,
            correct: verdict.correct, verdictReasoning: verdict.reasoning, reasoning: move.reasoning, belief,
          })
          console.log(`[${phase}] T${totalTurns} P${player} 推測「${move.content}」→ ${verdict.correct ? '正解' : '不正解'}`)
          if (verdict.correct) { solved = true; winner = player }
          else rejected[player].add(move.content)
          continue
        }
        const ans = await answerQuestion(oracleCall, words[opp], profiles[opp], move.content, config.answererModel)
        transcript.push({
          turn: totalTurns, asker: player, answerer: opp, kind: 'question', text: move.content,
          answer: ans.value, answerReasoning: ans.reasoning, reasoning: move.reasoning, belief,
        })
        console.log(`[${phase}] T${totalTurns} P${player} 質問「${move.content}」→ ${ans.value}`)
        continue
      }

      // externalized
      const decision = await decide(
        thinkerCall, beliefs[player], transcript, player, words[player], models[player], rejected[player],
      )
      beliefs[player] = decision.belief
      const beliefAtDecision = snapshot(decision.belief)

      if (decision.kind === 'guess') {
        const verdict = await judgeGuess(oracleCall, words[opp], decision.word, config.answererModel)
        transcript.push({
          turn: totalTurns, asker: player, kind: 'guess', word: decision.word,
          correct: verdict.correct, verdictReasoning: verdict.reasoning, reasoning: decision.reasoning,
          belief: beliefAtDecision, newcomers: decision.newcomers,
        })
        console.log(`[${phase}] T${totalTurns} P${player} 推測「${decision.word}」→ ${verdict.correct ? '正解' : '不正解'}`)
        if (verdict.correct) { solved = true; winner = player }
        else {
          // 棄却語を信念から除去し確率を再分配(持続信念が外れ候補に固着するのを断つ)
          rejected[player].add(decision.word)
          beliefs[player] = beliefs[player].filter((c) => c.word !== decision.word)
          const s = beliefs[player].reduce((a, c) => a + c.prob, 0) || 1
          for (const c of beliefs[player]) c.prob /= s
        }
        continue
      }

      const ans = await answerQuestion(oracleCall, words[opp], profiles[opp], decision.text, config.answererModel)
      // 観測回答で信念を事後へ更新(次ターンの EIG・当て判定はこの事後に基づく)
      bayesUpdate(beliefs[player], decision.predictions, ans.value as Value)
      const entry: QuestionMove = {
        turn: totalTurns, asker: player, answerer: opp, kind: 'question', text: decision.text,
        answer: ans.value, answerReasoning: ans.reasoning, reasoning: decision.reasoning,
        belief: beliefAtDecision,
        predictions: decision.predictions,
        beliefAfter: snapshot(beliefs[player]),
        questions: decision.questions,
        newcomers: decision.newcomers,
      }
      transcript.push(entry)
      console.log(`[${phase}] T${totalTurns} P${player} 質問「${decision.text}」→ ${ans.value}`)
    }
  }

  return {
    specIndex, replicaIndex, pair, words, profiles,
    thinkerModels: models, playModes,
    answererModel: config.answererModel,
    solved, winner, winnerWord: winner ? words[winner] : null, totalTurns,
    metrics: {
      1: computeMetrics(transcript, 1, words[2], playModes[1]),
      2: computeMetrics(transcript, 2, words[1], playModes[2]),
    },
    cost,
    transcript,
  }
}
