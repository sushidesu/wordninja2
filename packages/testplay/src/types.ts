// ── テストプレイの contract ──────────────────────────────────────
// ログ(game-*.json / summary.json)が観測の一次成果物。ここで定義する型が
// 「何を観測として残すか」の契約であり、viewer・後続分析はこれだけに依存する。

export type Model = 'opus' | 'sonnet' | 'haiku' | 'fable' | (string & {})

// externalized = 候補/質問/予想を分割生成しコードが EIG 選択(既定)。
// light = 1コールで次の一手を直接決める(内部推論)。
// readout = 1コールで「候補上位+確率」と次の質問を読み出す。証拠統合は LLM に
//           委ね、コードは推測判定(しきい値)と観測ログだけを担う(純LLM統合)。
export type PlayMode = 'externalized' | 'light' | 'readout'

export type Player = 1 | 2
export type Value = 'はい' | 'いいえ' | '部分的にそう' | 'わからない'

export type RunSpec = {
  pair: [string, string]
  repeat?: number
  models?: Partial<Record<Player, Model>>
  playModes?: Partial<Record<Player, PlayMode>>
}

// 入力(workflow 版と同じ形。logLabel と お題指定は必須・フォールバック無し)
export type Input = {
  logLabel: string
  runs?: RunSpec[]
  pair?: [string, string]
  pairs?: [string, string][]
  repeat?: number
  models?: Partial<Record<Player, Model>>
  playModes?: Partial<Record<Player, PlayMode>>
  answererModel?: Model
  maxTurnsPerPlayer?: number
  maxConcurrency?: number
  /** 全コールの思考量(claude -p --effort)。未指定は CLI 既定。低いほど速く安い */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

// ── LLM コール(1回の claude -p)の観測 ──────────────────────────
export type LlmUsage = {
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  durationMs: number
}

export type GameCost = LlmUsage & {
  byRole: { thinker: LlmUsage; oracle: LlmUsage }
}

// ── 信念・質問 ───────────────────────────────────────────────────
export type Candidate = { word: string; prob: number }

export type ScoredQuestion = { text: string; eig: number; chosen: boolean }

/** 新出語の参入監査: 遡及係数と、切り詰め後に生き残ったか(参入ゲートの観測) */
export type NewcomerAudit = { word: string; factor: number; kept: boolean }

// ── transcript ──────────────────────────────────────────────────
export type QuestionMove = {
  turn: number
  asker: Player
  answerer: Player
  kind: 'question'
  text: string
  answer: Value | '(無回答)'
  /** oracle の吟味。誤答診断のために必ず残す */
  answerReasoning: string
  /** 質問者側の選択理由 */
  reasoning: string
  /** 決定時点(reconcile 後・回答前)の事後。light は [] */
  belief: Candidate[]
  /** 採用質問への各候補の予想回答(尤度の素)。light は無し */
  predictions?: Record<string, Value>
  /** 実回答でベイズ更新した後の事後。light は無し */
  beliefAfter?: Candidate[]
  /** 候補質問と EIG(採用は chosen=true)。light は無し */
  questions?: ScoredQuestion[]
  /** このターンに提案された新出語の参入監査。light は無し */
  newcomers?: NewcomerAudit[]
}

export type GuessMove = {
  turn: number
  asker: Player
  kind: 'guess'
  word: string
  correct: boolean
  /** 正誤判定の理由(表記揺れ同一視の根拠を残す) */
  verdictReasoning: string
  reasoning: string
  belief: Candidate[]
  /** このターンに提案された新出語の参入監査。light は無し */
  newcomers?: NewcomerAudit[]
}

export type Move = QuestionMove | GuessMove

// ── ゲーム末尾にコードで導出する収束メトリクス(externalized のみ) ──
export type PlayerMetrics = {
  /** 正解語が支持集合に初めて入ったターン(入らなければ null) */
  targetFirstInSupportTurn: number | null
  /** 入った後に支持集合から追い出された回数(churn の可視化) */
  targetEvictions: number
  /** 最後の自ターン決定時点での正解語の事後確率 */
  targetFinalProb: number | null
  /** 同・順位(1始まり)。引き分けが「あと一歩」か「掠りもしない」かが分かる */
  targetFinalRank: number | null
  wrongGuesses: number
}

export type GameLog = {
  specIndex: number
  replicaIndex: number
  pair: [string, string]
  words: Record<Player, string>
  profiles: Record<Player, string>
  thinkerModels: Record<Player, Model>
  playModes: Record<Player, PlayMode>
  answererModel: Model
  solved: boolean
  winner: Player | null
  winnerWord: string | null
  totalTurns: number
  metrics: Record<Player, PlayerMetrics | null>
  cost: GameCost
  transcript: Move[]
}

// ── summary.json ─────────────────────────────────────────────────
export type ResolvedConfig = {
  answererModel: Model
  maxTurnsPerPlayer: number
  effort: string | null
  guessThreshold: number
  maxSupport: number
  likelihood: Record<string, number>
  runs: Required<Pick<RunSpec, 'pair'>>[] & RunSpec[]
  harness: 'claude-cli'
}

export type TopicSummary = {
  pair: [string, string]
  solvedCount: number
  replicaCount: number
  avgTurns: number | null
  /** お題の非対称性: 語ごとの勝ち数・収束の速さ */
  perWord: Record<
    string,
    {
      wins: number
      avgTurnsToWin: number | null
      avgTargetFirstInSupport: number | null
      avgTargetFinalProb: number | null
    }
  >
}

export type Summary = {
  logLabel: string
  config: ResolvedConfig
  summary: {
    games: number
    solved: number
    draws: number
    byPosition: Record<string, number>
    byWord: Record<string, number>
    avgTurns: number | null
    cost: GameCost
  }
  topics: TopicSummary[]
}
