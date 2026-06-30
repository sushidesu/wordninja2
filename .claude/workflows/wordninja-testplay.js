export const meta = {
  name: 'wordninja-testplay',
  description: 'ワードニンジャのお題ペアを2エージェントにテストプレイさせ、進行を事実ログとして出す',
  whenToUse: 'お題ペアがYes/No質問の当て合いゲームとして成立するかを観察したいとき。args.runs で「同一お題のN並列リプレイ」「複数お題の一括」を柔軟に指定できる。',
  phases: [{ title: 'Play', detail: 'お題ごと(リプレイごと)に2エージェントが交互にYes/No質問で相手の単語を当てる' }],
}

// ── 入力 contract ──────────────────────────────────────────────
// type Model = 'opus' | 'sonnet' | 'haiku' | 'fable'
// type RunSpec = { pair: [string,string]; repeat?: number; models?: {1?:Model;2?:Model} }
// args(runs / pairs / pair のいずれか必須。フォールバック既定お題は持たない):
//   logLabel: string                  ★必須。logs/<logLabel>/ に保存(game-*.json を逐次 + summary.json)
//   runs?:  RunSpec[]                  主入力(最も柔軟)
//   pair?:  [string,string]            単一お題(糖衣)
//   pairs?: [string,string][]          複数お題(糖衣)
//   repeat?: number                    全体デフォルトの並列リプレイ数(既定1)
//   models?: {1?:Model;2?:Model}       thinker 既定モデル(A/B 割当)。省略でセッション既定を継承
//   answererModel?: Model              oracle(回答役)モデル(既定 'sonnet')
//   maxTurnsPerPlayer?: number          1プレイヤーあたりの手番上限(既定20)
// ───────────────────────────────────────────────────────────────
// 運用注: 名前付き(/wordninja-testplay)はセッション起動時に読み込まれる。スクリプトを編集したら
//        反映に再起動が必要。反復中は Workflow({scriptPath}) で現ファイルを直接実行すること。

// Workflow ランタイムは args を JSON 文字列で渡してくることがある。不正なら黙って既定化せず、明確に失敗させる。
// (文字列のままだと args.repeat が String.prototype.repeat(関数)に化け、ループ条件が壊れる)
let A
if (typeof args === 'string') {
  try { A = JSON.parse(args) } catch (e) { throw new Error(`args が不正な JSON です: ${e.message}`) }
} else if (args && typeof args === 'object') {
  A = args
} else {
  throw new Error('入力(args)が必要です。pair / pairs / runs のいずれかを指定してください。')
}

const GLOBAL_REPEAT = A.repeat || 1
const GLOBAL_MODELS = A.models || {}
const ANSWERER_MODEL = A.answererModel || 'sonnet'
// 既定20: 収束しないゲームの暴走を防ぐ。40ターン(=各20手)で決まらなければ引き分け(solved:false)。
// 高すぎるとフライリングしたゲームがグローバル上限(1000 agent calls)を食い潰し、並列の他ゲームを道連れにする。
const MAX_ROUNDS = A.maxTurnsPerPlayer || 20

// ログ保存先 logs/<logLabel>/ の run 名。必須(フォールバック無し)。
const LOG_LABEL = A.logLabel
if (typeof LOG_LABEL !== 'string' || !LOG_LABEL.trim()) {
  throw new Error('logLabel(run名)が必要です。logs/<logLabel>/ に保存します。例: "2026-06-30-soba"')
}
if (/[/\\]|\.\./.test(LOG_LABEL)) {
  throw new Error('logLabel に / \\ .. は使えません(パス安全のため)。')
}

// 入力を RunSpec[] に正規化(runs 優先、無ければ pairs / pair の糖衣)。お題は必須でフォールバックは持たない。
function resolveSpecs() {
  if (Array.isArray(A.runs)) return A.runs
  if (Array.isArray(A.pairs)) return A.pairs.map((p) => ({ pair: p }))
  if (A.pair) return [{ pair: A.pair }]
  throw new Error('お題が指定されていません。pair([語,語]) / pairs / runs のいずれかを指定してください。')
}

function validatePair(p, where) {
  if (!Array.isArray(p) || p.length !== 2 || !p.every((w) => typeof w === 'string' && w.trim())) {
    throw new Error(`${where} の pair が不正です(2語の非空文字列配列が必要): ${JSON.stringify(p)}`)
  }
}

// RunSpec[] を「ゲームインスタンス」へ平坦化(repeat を展開)
const specs = resolveSpecs()
specs.forEach((s, i) => validatePair(s && s.pair, `runs[${i}]`))
const instances = []
specs.forEach((spec, specIndex) => {
  const repeat = spec.repeat || GLOBAL_REPEAT
  const models = spec.models || GLOBAL_MODELS
  for (let r = 0; r < repeat; r++) {
    instances.push({ pair: spec.pair, models, specIndex, replicaIndex: r, replicaCount: repeat })
  }
})

const opponentOf = (p) => (p === 1 ? 2 : 1)

const PREMISE = [
  'あなたはパーティゲーム「ワードニンジャ」をプレイしています。',
  '各プレイヤーには秘密の単語が1つ割り当てられています。すべての単語は何らかの共通のテーマに沿って選ばれています。',
  'あなたの目的は、Yes/Noで答えられる質問を重ねて、相手プレイヤーの単語を特定することです。',
  'これは早当て勝負です。相手も同時にあなたの単語を当てようとしており、先に相手の単語を正しく言い当てた方が勝ちます。',
  '',
  '【重要なルール】誰かが質問すると、相手プレイヤーが「自分自身の単語」について はい/いいえ で答えます。',
  'つまり各回答は「答えた人の単語」を表します。あなたが相手の単語を当てる手がかりになるのは、',
  '"あなたが質問して相手が答えたもの" だけです。あなたが答えた回答は、あなた自身の単語の情報なので相手当てには使えません。',
].join('\n')

const MOVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasoning: { type: 'string', description: 'なぜこの手を選んだかの短い思考' },
    kind: { type: 'string', enum: ['question', 'guess'] },
    text: { type: 'string', description: 'kindがquestionのときの質問文(Yes/Noで答えられるもの)' },
    word: { type: 'string', description: 'kindがguessのときに当てる単語' },
  },
  required: ['reasoning', 'kind'],
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { value: { type: 'string', enum: ['はい', 'いいえ', '部分的にそう', 'わからない'] } },
  required: ['value'],
}

// 推測の正誤判定は「同じ語か否か」の二値(部分的にそう/わからない は使わない)
const GUESS_VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { value: { type: 'string', enum: ['はい', 'いいえ'] } },
  required: ['value'],
}

// 語の実体(自然な意味+主要な事実的性質)。oracle がこれに一貫して照らして答える。
const PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { profile: { type: 'string', description: 'この単語の自然な意味と主要な事実的性質を簡潔に(2〜4文)' } },
  required: ['profile'],
}

// プレイヤー視点で「相手当てに使える情報」と「自分が聞かれたこと」を分離して描画。
// 各回答が誰の単語についてかを明示し、回答の誤帰属を防ぐ。
function renderForPlayer(transcript, player) {
  const opp = opponentOf(player)
  const aboutOpponent = []
  const aboutSelf = []
  const guesses = []
  transcript.forEach((e) => {
    if (e.kind === 'guess') {
      guesses.push(`プレイヤー${e.asker}が「${e.word}」と推測 → ${e.correct ? '正解' : '不正解'}`)
      return
    }
    const line = `「${e.text}」→ ${e.answer}`
    if (e.asker === player) aboutOpponent.push(line)
    else aboutSelf.push(line)
  })
  const sec = (title, arr) => `${title}\n` + (arr.length ? arr.map((l, i) => `  ${i + 1}. ${l}`).join('\n') : '  (まだなし)')
  return [
    sec(`【相手(プレイヤー${opp})の単語について判明していること】(あなたが質問し相手が答えた)`, aboutOpponent),
    '',
    sec('【あなたの単語について相手が質問してきたこと】(参考・相手当てには無関係)', aboutSelf),
    '',
    sec('【これまでの推測】', guesses),
  ].join('\n')
}

function callAgent(prompt, schema, label, phaseName, model) {
  const opts = { schema, label, phase: phaseName }
  if (model) opts.model = model
  return agent(prompt, opts)
}

// thinker(思考役): 自分の単語と公開ログから次の1手を決める
async function think(transcript, player, myWord, phaseName, model) {
  const prompt = [
    PREMISE,
    '',
    `あなたはプレイヤー${player}です。あなたの単語は「${myWord}」です。`,
    `相手はプレイヤー${opponentOf(player)}です。相手の単語を当ててください。`,
    '',
    renderForPlayer(transcript, player),
    '',
    'あなたの番です。はい/いいえ当ての最適戦略(情報量最大化)に従って1手を選んでください:',
    '1. これまでの回答に矛盾しない「相手の単語の候補」を思い浮かべ、それぞれの"ありそうさ"を見積もる。ありふれた語ほど有力(珍しい変種・細かい品種は事前確率が低い)。共通テーマも手がかりになる。',
    '2. ひとつの候補が突出して有力なら、kind="guess" でその語を当てる。',
    '3. まだ候補が割れているなら kind="question"。残る候補の"ありそうさ"をできるだけ半々に割る Yes/No の質問を選ぶ(情報量が最大)。既に分かっていること・答えがほぼ決まっている質問は情報がないので避ける。',
    '   質問文は問いたい属性を端的に問う。例示で属性より狭く限定・誘導しない(候補の列挙はこの思考内に留め、質問文には入れない)。例:「固体の物質(石・砂・氷のような)?」ではなく「固体ですか?」。',
    '',
    '原則:',
    '- 推測は手番を1つ消費し、外せばその間に相手が先に当てうる。確信が持てないのに、ありそうさの低い細かい候補を当てに行かない(損な賭け)。複数残るなら識別する質問を続ける。',
    '- 回答は段階的(はい / いいえ / 部分的にそう / わからない)。「部分的にそう」は相手の語がその性質を一部持つ(その側面を含む)という部分情報として扱い、候補を消さず多面性の手がかりにする。「わからない」はその性質では絞れないものとして扱う。',
    '- 回答は強い手がかりだが絶対ではない。ひとつの推論に賭けすぎない。',
  ].join('\n')
  return callAgent(prompt, MOVE_SCHEMA, `P${player}:思考`, phaseName, model)
}

// ゲーム開始時に各語の「実体」を一度だけ確定する。語ごとに安定した referent を持たせ、
// 場当たり回答による誤答・非整合を防ぐ(oracle はこれに一貫して照らす)。
async function profileWord(word, phaseName) {
  const prompt = [
    `「${word}」という単語について、事実に基づき簡潔に記述してください。`,
    '(1) この語が指す最も自然な意味・実体は何か。',
    '(2) 広く知られた主要な性質(分類、物理的な状態・形、どこにある/いつ現れる、見え方など)。',
    '知らない・自信がない場合は調べた上で、2〜4文でまとめてください。',
  ].join('\n')
  const r = await callAgent(prompt, PROFILE_SCHEMA, 'oracle:実体', phaseName, ANSWERER_MODEL)
  return r ? r.profile : ''
}

// oracle(回答役): (単語, 実体, 質問) → はい/いいえ/部分的にそう/わからない。事前確定した実体に一貫して照らす。
async function oracle(word, profile, question, phaseName) {
  const prompt = [
    'あなたは事実判定器です。ある単語と、その実体、そして質問が与えられます。',
    `単語: 「${word}」`,
    `この単語の実体: ${profile}`,
    `質問: 「${question}」`,
    `上の実体に一貫して照らし、「${word}」について質問に当てはまるなら「はい」、当てはまらないなら「いいえ」と答えてください。`,
    `「${word}」が複数の意味・側面を持ち、ある側面では当てはまるが別の側面では当てはまらない場合は「部分的にそう」と答えてください。`,
    '実体だけで判断がつかず、調べれば分かることは調べて正確に答えてください。',
    'それでも はい・いいえ のどちらとも判断できない場合のみ「わからない」と答えてください。',
    '明確なときは「はい」「いいえ」に倒すこと。「部分的にそう」は語が本当に多面的なときだけに限る。',
  ].join('\n')
  return callAgent(prompt, ANSWER_SCHEMA, 'oracle:回答', phaseName, ANSWERER_MODEL)
}

// 推測の正誤も、単語の持ち主(oracle)が判定する。質問と同じ賢さで表記揺れ・読み・別名を吸収する
// (素朴な文字列一致だと「そば」と「蕎麦」を別語と誤判定するため)。
async function judgeGuess(word, guessWord, phaseName) {
  const prompt = [
    `あなたは「${word}」という単語を持っています。`,
    `相手があなたの単語を「${guessWord}」だと推測しました。`,
    `「${guessWord}」は、あなたの単語「${word}」と同じものを指していますか?`,
    '表記の違い(ひらがな・カタカナ・漢字)、読み、一般的な別名・同義語は「同じ(はい)」とみなしてください。',
    '明確に別の単語を指す場合は「いいえ」と答えてください。',
  ].join('\n')
  return callAgent(prompt, GUESS_VERDICT_SCHEMA, 'oracle:推測判定', phaseName, ANSWERER_MODEL)
}

const PERSIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'ファイルを書き、読み戻してJSONとして検証できたか' },
    path: { type: 'string', description: '書いたファイルのパス' },
    note: { type: 'string', description: '失敗時の理由' },
  },
  required: ['ok', 'path'],
}

// 保存は決定的スクリプトに委譲する。sub-agent の仕事は「スクリプトを1回叩く」だけ。
// LLM は JSON を1回 stdin に流すのみで、mkdir/書き込み/読み戻し検証はスクリプト側(素の fs)が行う。
// → LLM に Read検証や手順判断をさせない=低コスト・高速。検証も LLM の自己申告でなく exit code で確実。
async function persistJson(obj, file, requiredKeys, phaseName) {
  const parts = file.split('/')
  const name = parts[parts.length - 1]
  const label = parts[parts.length - 2]
  const payload = JSON.stringify(obj)
  const prompt = [
    'テストプレイのログを保存します。あなたの仕事は保存スクリプトを1回実行するだけです(ファイル操作と検証はスクリプトが行います)。',
    'リポジトリ直下で、Bash で次を実行してください(JSON はヒアドキュメントで標準入力に渡す。中身は一字一句そのまま):',
    '```',
    `node packages/testplay-viewer/scripts/persist.mjs '${label}' '${name}' ${requiredKeys.join(' ')} <<'JSON'`,
    payload,
    'JSON',
    '```',
    '終了コード0かつ標準出力が "OK <path>" なら成功 → ok=true・path にその <path>。',
    '0以外で終了 or 標準エラーが出たら ok=false・note にそのエラー文(リトライは不要、呼び出し側が処理します)。',
  ].join('\n')
  return callAgent(prompt, PERSIST_SCHEMA, '保存', phaseName, 'haiku')
}

// 保存 + 失敗時1リトライ。最終的に失敗しても log 警告のみ(ゲーム/集計は止めない)。
async function save(obj, file, requiredKeys, phaseName) {
  let r = await persistJson(obj, file, requiredKeys, phaseName)
  if (!r || !r.ok) r = await persistJson(obj, file, requiredKeys, phaseName)
  if (!r || !r.ok) log(`⚠ 保存失敗: ${file} ${r && r.note ? r.note : '(無応答)'}`)
  else log(`保存: ${r.path}`)
  return r
}

// 1ゲーム=1お題1リプレイ。状態はこの関数内に閉じるので並列実行しても干渉しない。
async function playGame(inst) {
  const { pair, models, specIndex, replicaIndex, replicaCount } = inst
  const WORDS = { 1: pair[0], 2: pair[1] }
  const phaseName = replicaCount > 1 ? `${pair[0]}×${pair[1]} #${replicaIndex + 1}` : `${pair[0]}×${pair[1]}`
  const transcript = []
  let solved = false
  let winner = null
  let totalTurns = 0

  // 語の実体をゲーム開始時に一度だけ確定(両語を並行)。以降の oracle 回答はこれに一貫して照らす。
  const [prof1, prof2] = await Promise.all([
    profileWord(WORDS[1], phaseName),
    profileWord(WORDS[2], phaseName),
  ])
  const profiles = { 1: prof1, 2: prof2 }

  for (let round = 0; round < MAX_ROUNDS && !solved; round++) {
    for (const player of [1, 2]) {
      if (solved) break
      totalTurns++
      const move = await think(transcript, player, WORDS[player], phaseName, models[player])
      if (!move) continue

      if (move.kind === 'guess') {
        const verdict = await judgeGuess(WORDS[opponentOf(player)], move.word, phaseName)
        const correct = verdict ? verdict.value === 'はい' : false
        transcript.push({ turn: totalTurns, asker: player, kind: 'guess', word: move.word, correct, reasoning: move.reasoning })
        log(`[${phaseName}] T${totalTurns} P${player} 推測「${move.word}」→ ${correct ? '正解' : '不正解'}`)
        if (correct) { solved = true; winner = player }
        continue
      }

      if (!move.text) continue
      const answerer = opponentOf(player)
      const ans = await oracle(WORDS[answerer], profiles[answerer], move.text, phaseName)
      const value = ans ? ans.value : '(無回答)'
      transcript.push({ turn: totalTurns, asker: player, answerer, kind: 'question', text: move.text, answer: value, reasoning: move.reasoning })
      log(`[${phaseName}] T${totalTurns} P${player} 質問「${move.text}」→ ${value}`)
    }
  }

  const result = {
    specIndex,
    replicaIndex,
    pair,
    words: WORDS,
    profiles,
    thinkerModels: { 1: models[1] || '(default)', 2: models[2] || '(default)' },
    answererModel: ANSWERER_MODEL,
    solved,
    winner,
    winnerWord: winner ? WORDS[winner] : null,
    totalTurns,
    transcript,
  }
  // ゲーム完了の瞬間に自分の記録を保存(部分障害に強い: 途中で run が死んでも完了分は残る)。
  await save(result, `logs/${LOG_LABEL}/game-${specIndex}-${replicaIndex}.json`, ['pair', 'transcript'], phaseName)
  return result
}

log(`${instances.length} ゲームを並列実行(同時実行上限 ~10、超過分は自動でキュー)。お題 ${specs.length} 種 / 総リプレイ ${instances.length}`)

// 全ゲーム(リプレイ含む)を並列。各ゲームは内部直列なので実時間 ≈ 最も長い1ゲーム + キュー待ち。
const games = (await parallel(instances.map((inst) => () => playGame(inst)))).filter(Boolean)

// お題単位で集約
const topics = specs.map((spec, specIndex) => {
  const mine = games.filter((g) => g.specIndex === specIndex)
  const solved = mine.filter((g) => g.solved)
  const avgTurns = solved.length ? Math.round((solved.reduce((a, g) => a + g.totalTurns, 0) / solved.length) * 10) / 10 : null
  return {
    pair: spec.pair,
    solvedCount: solved.length,
    replicaCount: mine.length,
    avgTurns,
    games: mine,
  }
})

// 全ゲーム横断のサマリ(勝率の手集計を不要にする)
const decided = games.filter((g) => g.solved)
const summary = {
  games: games.length,
  solved: decided.length,
  draws: games.length - decided.length,
  byPosition: {
    '先手P1': decided.filter((g) => g.winner === 1).length,
    '後手P2': decided.filter((g) => g.winner === 2).length,
  },
  byWord: decided.reduce((acc, g) => { acc[g.winnerWord] = (acc[g.winnerWord] || 0) + 1; return acc }, {}),
  avgTurns: decided.length ? Math.round((decided.reduce((a, g) => a + g.totalTurns, 0) / decided.length) * 10) / 10 : null,
}

// summary(+お題メタ)も保存。transcript は各 game ファイルにあるので summary には含めない(肥大化回避)。
const topicsLite = topics.map((t) => ({ pair: t.pair, solvedCount: t.solvedCount, replicaCount: t.replicaCount, avgTurns: t.avgTurns }))
await save({ logLabel: LOG_LABEL, summary, topics: topicsLite }, `logs/${LOG_LABEL}/summary.json`, ['summary'], 'Play')

return { summary, topics, logDir: `logs/${LOG_LABEL}` }
