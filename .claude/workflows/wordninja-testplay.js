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

// 外部化EIG: thinker は「生成」だけ担当し、質問の選択はコードが EIG 計算で行う
const BELIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { word: { type: 'string' }, prob: { type: 'number', description: '相対的なもっともらしさ(合計約1)' } },
        required: ['word', 'prob'],
      },
    },
  },
  required: ['candidates'],
}

const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { questions: { type: 'array', items: { type: 'string' } } },
  required: ['questions'],
}

const SIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    grid: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          question: { type: 'string' },
          answers: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { word: { type: 'string' }, value: { type: 'string', enum: ['はい', 'いいえ', '部分的にそう', 'わからない'] } },
              required: ['word', 'value'],
            },
          },
        },
        required: ['question', 'answers'],
      },
    },
  },
  required: ['grid'],
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasoning: { type: 'string', description: 'この性質が単語の定義的特徴か・正体を誤って伝えないかを短く吟味' },
    value: { type: 'string', enum: ['はい', 'いいえ', '部分的にそう', 'わからない'] },
  },
  required: ['reasoning', 'value'],
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

// ── 持続的ベイズ信念 + 外部化EIG の thinker (UoT: Uncertainty of Thoughts) ──────
// LLM は「支持集合の提案・質問生成・回答予想」だけ担当する。確率(信念)はコードが所有し、
// 観測回答ごとに P(語|回答) ∝ P(語)·P(回答|語,質問) でベイズ更新する。質問の"選択"は
// この事後確率に対する EIG 計算でコードが行う。これにより ①証拠が乗算で積み上がり収束が急峻になる
// ②既出質問は事後に織り込み済み → EIG≈0 で自動的に再選択されない(冗長再質問の根治)
// ③「EIG最大と自己申告するだけ(後付け正当化)」を構造的に排除、を同時に満たす。
const GUESS_THRESHOLD = 0.55 // 最有力候補の(正規化後)事後確率がこれ以上なら当てに行く
const MAX_SUPPORT = 12 // 支持集合の上限(事後上位のみ残す)。毎ターンのLLM新提案を無制限に和集合すると集合が膨張し、信念が拡散して収束しない(EIG横並び・冗長質問が沈まない)ため

function entropy(probs) {
  const s = probs.reduce((a, p) => a + p, 0)
  if (s <= 0) return 0
  let h = 0
  for (const p of probs) { const q = p / s; if (q > 0) h -= q * Math.log2(q) }
  return h
}

function argmax(arr, f) {
  let best = null, bestV = -Infinity
  for (const x of arr) { const v = f(x); if (v > bestV) { bestV = v; best = x } }
  return best
}

// 質問 q の期待情報利得: H(事前) − Σ_v P(答えv)·H(答えvで残る候補)
function eig(question, grid, candidates) {
  const row = grid.find((g) => g.question === question)
  if (!row) return -Infinity
  const ansOf = (w) => { const a = row.answers.find((x) => x.word === w); return a ? a.value : 'わからない' }
  const total = candidates.reduce((a, c) => a + c.prob, 0) || 1
  const buckets = {}
  for (const c of candidates) { const v = ansOf(c.word); (buckets[v] = buckets[v] || []).push(c.prob) }
  let expPost = 0
  for (const v in buckets) {
    const m = buckets[v].reduce((a, p) => a + p, 0)
    expPost += (m / total) * entropy(buckets[v])
  }
  return entropy(candidates.map((c) => c.prob)) - expPost
}

// 予測回答 pred と実測 obs の軟マッチ尤度 P(obs | 語, 質問)。はい/いいえ を確定、
// 部分的にそう/わからない を曖昧値として扱う3段階。単一の曖昧不一致で候補をゼロにしないため
// 軟らかく持つ(oracle は各質問へ厳密に答える=個々の正確さ優先ゆえ予測とズレ得る)。
function likelihood(pred, obs) {
  if (pred === obs) return 0.8
  const fuzzy = (v) => v === '部分的にそう' || v === 'わからない'
  if (fuzzy(pred) || fuzzy(obs)) return 0.35
  return 0.05 // はい↔いいえ の明確な逆
}

// 観測回答で信念をベイズ更新(in place)。尤度は回答シミュレーション grid をそのまま流用する。
function bayesUpdate(belief, question, grid, observed) {
  const row = grid.find((g) => g.question === question)
  if (!row) return belief
  const predOf = (w) => { const a = row.answers.find((x) => x.word === w); return a ? a.value : 'わからない' }
  for (const c of belief) c.prob *= likelihood(predOf(c.word), observed)
  const s = belief.reduce((a, c) => a + c.prob, 0)
  if (s > 0) for (const c of belief) c.prob /= s
  return belief
}

// LLM が提案した支持集合を既存の信念に統合する。確率はコードが所有するので、既存語の事後は
// 保持し、新出語だけ小さな事前で追加する(LLMに確率をリセットさせない)。信念が空(初手)なら
// LLM のもっともらしさをそのまま事前 P0 とする。事後が床未満かつ今回挙がらなかった語は剪定。
function reconcileSupport(belief, proposed, rejected) {
  // 誤推測で棄却された語は除外する(「Xか?→いいえ」は P(X)=0 の観測。再提案されても復活させない)。
  const kept = belief.filter((c) => !rejected.has(c.word))
  const byWord = new Map(kept.map((c) => [c.word, c]))
  const seed = kept.length ? Math.max(Math.min(...kept.map((c) => c.prob)), 0.02) : 0
  for (const p of proposed) {
    if (rejected.has(p.word) || byWord.has(p.word)) continue
    byWord.set(p.word, { word: p.word, prob: kept.length ? seed : (p.prob || 0.01) })
  }
  let list = [...byWord.values()]
  const norm = () => { const s = list.reduce((a, c) => a + c.prob, 0) || 1; for (const c of list) c.prob /= s }
  norm()
  // 事後上位 MAX_SUPPORT に切り詰める(UoT の有界な可能性集合に倣う。ビーム探索/粒子フィルタ的な truncation)。
  list.sort((a, b) => b.prob - a.prob)
  if (list.length > MAX_SUPPORT) list = list.slice(0, MAX_SUPPORT)
  norm()
  return list
}

// 1手ぶんの意思決定。返り値の belief(統合後の支持集合)は呼び出し側が beliefs[player] に保持し、
// oracle 回答後に bayesUpdate で事後へ更新する。move.grid は更新に使う質問×語の予測表。
async function decide(belief, transcript, player, myWord, phaseName, model, rejected) {
  const known = renderForPlayer(transcript, player)
  const opp = opponentOf(player)

  // ① 支持集合の提案(LLM)。既知事実に矛盾しない語を挙げさせ、コード側の事後と統合する。
  //    候補は「互いに異なる代表概念」に限る: 同義語・言い換え・ブランド名/具体例を併記すると事後の
  //    確率マスが等価な仮説へ分裂し、真の語が閾値に届かない(実測: カフェ/喫茶店/スタバ… へ分散して未解決)。
  //    また事実に反しない範囲で異なる系統も含め多様性を保つ(1領域への早すぎる収束=誤固着を防ぐ)。
  //    根拠: 仮説の distinctness による事後マス集中(entity disambiguation の posterior pursuit)+
  //          active inference(EFE)の探索——情報利得が尽きるまで多様な仮説を保つ。
  const prop = await callAgent([
    'あなたはパーティゲーム「ワードニンジャ」の参加者で、相手プレイヤーの秘密の単語を当てようとしています。',
    `すべての単語は共通のテーマで選ばれています。あなた自身の単語は「${myWord}」で、相手の単語とテーマで結ばれています(手がかり)。`,
    '相手の単語について、あなたが質問して判明した事実:',
    known,
    '上の事実すべてに矛盾しない「相手の単語」の候補を、ありそうな順に最大12語、各語に相対的なもっともらしさ(合計約1.0)を付けて挙げてください。',
    '候補リストの条件:',
    '- 各候補は互いに明確に異なる概念にする。同じ対象の言い換え・同義語や、ある一般概念に含まれる具体例・商品名・ブランド名は候補に併記せず、最も一般的で代表的な語ひとつに統合する。',
    '- ありふれた一般名詞を優先し、固有名詞や過度に限定的な語は避ける。',
    '- 事実に反しない範囲で、異なる系統・カテゴリにわたる多様な候補を含める(ひとつの領域に偏らせない)。',
  ].join('\n'), BELIEF_SCHEMA, `P${player}:候補`, phaseName, model)
  const proposed = ((prop && prop.candidates) || []).filter((c) => c.word && String(c.word).trim())
  const cands = reconcileSupport(belief, proposed, rejected)
  if (!cands.length) return { move: { kind: 'question', text: 'それは生き物ですか?', reasoning: '候補生成失敗の保険' }, belief: cands }

  // ② 突出した事後があれば当てに行く(コード判定)
  const total = cands.reduce((a, c) => a + c.prob, 0) || 1
  const top = argmax(cands, (c) => c.prob)
  if (top.prob / total >= GUESS_THRESHOLD) return { move: { kind: 'guess', word: top.word, reasoning: `事後最大 ${top.word}(${(top.prob / total).toFixed(2)})` }, belief: cands }

  // ③ 質問生成(LLM)。候補は"思考の手がかり"として見せる(思考の過程は残す)が、質問文は
  //    候補を列挙しない素の一文に保つ。生成の狙いは「現在の信念を最も強く弁別する質問」=期待情報
  //    利得の最大化(UoT / Learning to Ask Informative Questions, arXiv 2406.17453)。広く二分する
  //    だけの汎用質問は近義語を分けられないため、候補が似通うときは差を突く弁別質問を作らせる。
  //    さらに coarse-to-fine を優先させる(20 Questions 最適戦略 arXiv 2106.01737 = Huffman符号/均等分割:
  //    機能・カテゴリの広い二分を先に、付随属性は後)——序盤を付随的属性に浪費し核心軸が遅れる問題への対処。
  //    (プロンプトは Anthropic best practices: データをXMLで分離・重要順の明確な成功基準・肯定形の具体指示)
  const qgen = await callAgent([
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
    '- 一般化した性質を問う、短く自然な一文にする。実際のゲームで人が口にする形。',
    '- 候補語そのものを文に挙げない。「(A・B を分ける)」のような例示・補足を文に含めない。',
    '</質問文のルール>',
  ].join('\n'), QUESTIONS_SCHEMA, `P${player}:質問案`, phaseName, model)
  const questions = ((qgen && qgen.questions) || []).filter((q) => q && String(q).trim())
  if (!questions.length) return { move: { kind: 'guess', word: top.word, reasoning: '質問生成失敗→最有力を当てる' }, belief: cands }

  // ④ 回答シミュレーション(LLM生成、質問×支持集合)。EIG計算とベイズ更新の両方の尤度源。
  const sim = await callAgent([
    '次の各質問について、各候補語がどう答えるかを予想してください(その語の一般的な性質に基づき正確に。はい/いいえ/部分的にそう/わからない)。',
    '候補語: ' + cands.map((c) => c.word).join(', '),
    '質問:',
    questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    'grid に、質問ごとに全候補語の予想回答を入れてください。',
  ].join('\n'), SIM_SCHEMA, `P${player}:予想`, phaseName, model)
  const grid = (sim && sim.grid) || []

  // ⑤ 各質問の EIG をコードで計算し、最大を選ぶ(選択はコード)。事後に対する利得なので既出軸は自動で沈む。
  //    候補質問と EIG は「なぜこの質問を選んだか」を追うためにログへ残す(採用を chosen=true で明示)。
  const scored = questions
    .map((q) => ({ text: q, eig: Math.round(eig(q, grid, cands) * 1000) / 1000 }))
    .sort((a, b) => b.eig - a.eig)
  const best = scored[0].text
  const questionsOut = scored.map((s) => ({ text: s.text, eig: s.eig, chosen: s.text === best }))
  return { move: { kind: 'question', text: best, grid, questions: questionsOut, reasoning: `EIG最大(支持${cands.length}語・質問${questions.length}をコード選択)` }, belief: cands }
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
    '即答せず、まず reasoning で考えてから答えてください: (1) この問いはこの単語について何を問うているか、(2) その性質は単語の定義的・顕著な特徴か、それとも周辺的・技術的な事柄か、(3) はい/いいえ のどちらかが単語の正体を誤って伝えないか。',
    `そのうえで、上の実体に照らして質問に当てはまるなら「はい」、当てはまらないなら「いいえ」と答える。字義的には真でも、周辺的な事実で単語の正体を誤って伝える答えは避ける。`,
    '複数の意味・側面を持ち、ある側面では当てはまるが別の側面では当てはまらない場合は「部分的にそう」。',
    '知らない・自信がない場合は調べた上で正確に。どうしても はい・いいえ が定まらない場合のみ「わからない」。',
    '明確なときは「はい」「いいえ」に倒す。戦略や誘導はせず、正確さのためだけに考える。',
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

  // 各プレイヤーの信念(相手の単語についての事後確率)。ターンをまたいで持続する。
  const beliefs = { 1: [], 2: [] }
  // 誤推測で棄却された語(「Xか?→いいえ」= P(X)=0)。信念から除外し再推測を防ぐ。
  const rejected = { 1: new Set(), 2: new Set() }

  for (let round = 0; round < MAX_ROUNDS && !solved; round++) {
    for (const player of [1, 2]) {
      if (solved) break
      totalTurns++
      const decision = await decide(beliefs[player], transcript, player, WORDS[player], phaseName, models[player], rejected[player])
      beliefs[player] = decision.belief
      const move = decision.move
      if (!move) continue
      // 決定時点の信念(事後確率)を snapshot 保存(bayesUpdate で in-place 更新される前にコピー)。
      // ビューワーで「候補が絞られていく様子」を見るための観測ログ。新規エージェント呼び出しは無い。
      const belief = decision.belief.map((c) => ({ word: c.word, prob: Math.round(c.prob * 1000) / 1000 }))

      if (move.kind === 'guess') {
        const verdict = await judgeGuess(WORDS[opponentOf(player)], move.word, phaseName)
        const correct = verdict ? verdict.value === 'はい' : false
        transcript.push({ turn: totalTurns, asker: player, kind: 'guess', word: move.word, correct, reasoning: move.reasoning, belief })
        log(`[${phaseName}] T${totalTurns} P${player} 推測「${move.word}」→ ${correct ? '正解' : '不正解'}`)
        if (correct) { solved = true; winner = player }
        else {
          // 棄却語を信念から除去し確率を再分配(持続信念が外れ候補に固着するのを断つ)。
          rejected[player].add(move.word)
          beliefs[player] = beliefs[player].filter((c) => c.word !== move.word)
          const s = beliefs[player].reduce((a, c) => a + c.prob, 0) || 1
          for (const c of beliefs[player]) c.prob /= s
        }
        continue
      }

      if (!move.text) continue
      const answerer = opponentOf(player)
      const ans = await oracle(WORDS[answerer], profiles[answerer], move.text, phaseName)
      const value = ans ? ans.value : '(無回答)'
      // 観測回答で信念を事後へ更新(次ターンの EIG・当て判定はこの事後に基づく)。
      if (value !== '(無回答)' && move.grid) bayesUpdate(beliefs[player], move.text, move.grid, value)
      transcript.push({ turn: totalTurns, asker: player, answerer, kind: 'question', text: move.text, answer: value, reasoning: move.reasoning, belief, questions: move.questions })
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
