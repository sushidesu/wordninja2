import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ── ログの所在(唯一のソース)──────────────────────────────
// packages/testplay-viewer/src → リポジトリ直下 /logs。env LOGS_DIR で上書き可。
const LOGS_DIR = process.env.LOGS_DIR
  ? resolve(process.env.LOGS_DIR)
  : resolve(import.meta.dirname, '..', '..', '..', 'logs')
const PORT = Number(process.env.PORT ?? 5180)

// ── ログ読み取り(毎リクエスト直読み = 固定HTMLを焼かない)───────
type Move = {
  turn: number
  asker: number
  answerer?: number
  kind: 'question' | 'guess'
  text?: string
  answer?: string
  word?: string
  correct?: boolean
  reasoning?: string
  belief?: { word: string; prob: number }[]
  questions?: { text: string; eig: number; chosen?: boolean }[]
}
type Game = {
  specIndex: number
  replicaIndex: number
  pair: [string, string]
  words: Record<string, string>
  profiles?: Record<string, string>
  thinkerModels?: Record<string, string>
  answererModel?: string
  solved: boolean
  winner: number | null
  winnerWord: string | null
  totalTurns: number
  transcript: Move[]
}
type Summary = {
  games: number
  solved: number
  draws: number
  byPosition: Record<string, number>
  byWord: Record<string, number>
  avgTurns: number | null
}

const safe = (s: string) => /^[^/\\]+$/.test(s) && !s.includes('..')
const readJson = <T,>(path: string): T | null => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

// run = logs/ 直下のディレクトリ(新形式: game-*.json + summary.json を持つ)
function listRuns(): { label: string; summary: Summary | null; mtime: number }[] {
  if (!existsSync(LOGS_DIR)) return []
  return readdirSync(LOGS_DIR)
    .filter((name) => {
      try {
        return statSync(join(LOGS_DIR, name)).isDirectory()
      } catch {
        return false
      }
    })
    .map((label) => {
      const s = readJson<{ summary: Summary }>(join(LOGS_DIR, label, 'summary.json'))
      const mtime = statSync(join(LOGS_DIR, label)).mtimeMs
      return { label, summary: s?.summary ?? null, mtime }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function listGames(label: string): Game[] {
  const dir = join(LOGS_DIR, label)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith('game-') && f.endsWith('.json'))
    .map((f) => readJson<Game>(join(dir, f)))
    .filter((g): g is Game => g !== null)
    .sort((a, b) => a.specIndex - b.specIndex || a.replicaIndex - b.replicaIndex)
}

function gameFileName(g: Game) {
  return `game-${g.specIndex}-${g.replicaIndex}.json`
}

// ── グルーピング(run を跨いだ横断)────────────────────────────
// お題は順序なしで同一視(先手入替をまとめる)。語別の勝敗は winnerWord に残るので失われない。
const topicKey = (pair: [string, string]) => [pair[0], pair[1]].slice().sort().join('|')
const topicLabel = (pair: [string, string]) => [pair[0], pair[1]].slice().sort().join(' × ')

type Entry = { run: string; file: string; game: Game }
function allGames(): Entry[] {
  const out: Entry[] = []
  for (const r of listRuns()) for (const g of listGames(r.label)) out.push({ run: r.label, file: gameFileName(g), game: g })
  return out
}

type Agg = { n: number; solved: number; draws: number; avgTurns: number | null; byWord: Record<string, number>; byPosition: Record<string, number> }
function aggregate(games: Game[]): Agg {
  const won = games.filter((g) => g.solved)
  const byWord: Record<string, number> = {}
  const byPosition: Record<string, number> = { '先手P1': 0, '後手P2': 0 }
  for (const g of won) {
    if (g.winnerWord) byWord[g.winnerWord] = (byWord[g.winnerWord] || 0) + 1
    if (g.winner === 1) byPosition['先手P1']++
    else if (g.winner === 2) byPosition['後手P2']++
  }
  const avgTurns = won.length ? Math.round((won.reduce((a, g) => a + g.totalTurns, 0) / won.length) * 10) / 10 : null
  return { n: games.length, solved: won.length, draws: games.length - won.length, avgTurns, byWord, byPosition }
}

type Topic = { key: string; label: string; entries: Entry[] }
function groupTopics(): Topic[] {
  const map = new Map<string, Topic>()
  for (const e of allGames()) {
    const k = topicKey(e.game.pair)
    if (!map.has(k)) map.set(k, { key: k, label: topicLabel(e.game.pair), entries: [] })
    map.get(k)!.entries.push(e)
  }
  return [...map.values()].sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label))
}

type G = 'run' | 'topic' | 'model'

// ── モデル比較(単一モデルで集計。対戦相手は gate せず"パラメータ"扱い)──
// 1ゲーム=プレイヤー枠2つ=2観測。sonnet同士なら sonnet の観測が2件、opus vs sonnet なら各1件。
const norm = (m?: string) => m || '(default)'
type Obs = { model: string; opponent: string; run: string; topicLabel: string; topicK: string; word: string; result: 'win' | 'loss' | 'draw'; turns: number }
function observations(): Obs[] {
  const out: Obs[] = []
  for (const e of allGames()) {
    const g = e.game
    for (const p of [1, 2] as const) {
      const model = norm(g.thinkerModels?.[String(p)])
      const opponent = norm(g.thinkerModels?.[String(p === 1 ? 2 : 1)])
      const result: Obs['result'] = !g.solved ? 'draw' : g.winner === p ? 'win' : 'loss'
      // 担当単語は正準の pair から導出(一部の古いログは words にプロファイル文が混入しているため)
      out.push({ model, opponent, run: e.run, topicLabel: topicLabel(g.pair), topicK: topicKey(g.pair), word: g.pair[p - 1], result, turns: g.totalTurns })
    }
  }
  return out
}
function groupModels(): { name: string; obs: Obs[] }[] {
  const map = new Map<string, Obs[]>()
  for (const o of observations()) {
    if (!map.has(o.model)) map.set(o.model, [])
    map.get(o.model)!.push(o)
  }
  return [...map.entries()].map(([name, obs]) => ({ name, obs })).sort((a, b) => b.obs.length - a.obs.length)
}
function modelAgg(obs: Obs[]) {
  const wins = obs.filter((o) => o.result === 'win').length
  const losses = obs.filter((o) => o.result === 'loss').length
  const draws = obs.filter((o) => o.result === 'draw').length
  const wonTurns = obs.filter((o) => o.result === 'win').map((o) => o.turns)
  const avgTurns = wonTurns.length ? Math.round((wonTurns.reduce((a, b) => a + b, 0) / wonTurns.length) * 10) / 10 : null
  return { n: obs.length, wins, losses, draws, winRate: wins + losses ? wins / (wins + losses) : null, avgTurns }
}
// セル = run × お題 × 担当単語 × 相手。run 間で設定(プロンプトやワークフロー版)が変わるため、
// run を跨いで合算せず、run を第一キーとして分けて見せる(新しい run が上)。
type MCell = { run: string; topicLabel: string; word: string; opponent: string; win: number; loss: number; draw: number }
function modelCells(obs: Obs[]): MCell[] {
  const map = new Map<string, MCell>()
  for (const o of obs) {
    const k = o.run + '::' + o.topicK + '::' + o.word + '::' + o.opponent
    if (!map.has(k)) map.set(k, { run: o.run, topicLabel: o.topicLabel, word: o.word, opponent: o.opponent, win: 0, loss: 0, draw: 0 })
    map.get(k)![o.result]++
  }
  return [...map.values()].sort((a, b) => b.run.localeCompare(a.run) || a.topicLabel.localeCompare(b.topicLabel) || a.word.localeCompare(b.word) || a.opponent.localeCompare(b.opponent))
}
const pct = (x: number | null) => (x == null ? '–' : Math.round(x * 100) + '%')

// ── 表示部品(Hono JSX, サーバサイドレンダリング)──────────────
const STYLE = `
  :root { color-scheme: dark; --bd: #8883; --mut: #8889; --bg: #0f1115; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.6 -apple-system, "Hiragino Sans", system-ui, sans-serif; background: var(--bg); color: #e8e8ea; }
  .wrap { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
  .side { border-right: 1px solid var(--bd); padding: 12px; overflow-y: auto; max-height: 100vh; position: sticky; top: 0; }
  .side h1 { font-size: 13px; letter-spacing: .04em; opacity: .6; margin: 4px 0 12px; }
  .runs a { display: block; padding: 8px 10px; border-radius: 8px; text-decoration: none; color: inherit; }
  .runs a:hover { background: #8881; }
  .runs a.active { background: #6cf3; font-weight: 600; }
  .runs .meta { font-size: 11px; opacity: .6; }
  .games { margin: 6px 0 0 8px; padding-left: 8px; border-left: 1px solid var(--bd); }
  .games a { font-size: 12px; padding: 5px 8px; }
  .main { padding: 24px 32px; max-width: 920px; }
  .crumb { font-size: 12px; opacity: .6; margin-bottom: 8px; }
  h2 { margin: 0 0 16px; }
  .stat { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 18px; }
  .stat div b { font-size: 22px; display: block; }
  .stat div span { font-size: 11px; opacity: .6; }
  .bar { height: 22px; border-radius: 6px; overflow: hidden; display: flex; background: #8882; margin: 4px 0 14px; }
  .bar i { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-style: normal; }
  .turn { border: 1px solid var(--bd); border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
  .turn .head { font-size: 12px; opacity: .7; margin-bottom: 2px; }
  .turn .q { font-weight: 600; }
  .ans { font-weight: 700; padding: 1px 8px; border-radius: 6px; margin-left: 6px; }
  .ans.はい { background: #16a34a22; color: #16a34a; }
  .ans.いいえ { background: #ef444422; color: #ef4444; }
  .ans.わからない { background: #f59e0b22; color: #f59e0b; }
  .ans.部分的にそう { background: #14b8a622; color: #2dd4bf; }
  .guess { border-width: 2px; }
  .guess.ok { border-color: #16a34a; }
  .guess.ng { border-color: #ef4444; }
  details { margin-top: 6px; }
  summary { cursor: pointer; font-size: 12px; opacity: .6; }
  details p { margin: 6px 0 0; font-size: 13px; opacity: .85; white-space: pre-wrap; }
  .pill { display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--bd); margin-right: 6px; }
  .empty { opacity: .6; padding: 40px 0; }
  .legend { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 4px 0 18px; font-size: 13px; }
  .legend .p1c { color: #6366f1; font-weight: 700; }
  .legend .p2c { color: #ec4899; font-weight: 700; }
  .legend .mid { font-size: 12px; opacity: .7; text-align: center; }
  .replay { display: flex; flex-direction: column; gap: 8px; }
  .turn { max-width: 80%; }
  .turn.p1 { align-self: flex-start; background: #6366f10d; border-left: 3px solid #6366f1; }
  .turn.p2 { align-self: flex-end; background: #ec489912; border-right: 3px solid #ec4899; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 14px; }
  .toolbar button { font: inherit; font-size: 12px; padding: 6px 12px; border: 1px solid var(--bd); border-radius: 8px; background: #8881; color: inherit; cursor: pointer; }
  .toolbar button:hover { background: #8883; }
  #capture { background: var(--bg); padding: 20px 24px; border-radius: 12px; }
  .gtoggle { display: flex; gap: 4px; margin-bottom: 12px; }
  .gtoggle a { flex: 1; text-align: center; font-size: 12px; padding: 5px; border: 1px solid var(--bd); border-radius: 8px; text-decoration: none; color: inherit; opacity: .65; }
  .gtoggle a.on { background: #6cf3; opacity: 1; font-weight: 600; }
  table.cmp { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  table.cmp th, table.cmp td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--bd); }
  table.cmp th { opacity: .55; font-weight: 600; font-size: 11px; }
  table.cmp td.num, table.cmp th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .belief { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
  .belief .cand { display: grid; grid-template-columns: 96px 1fr 40px; align-items: center; gap: 6px; font-size: 11px; }
  .belief .cand .w { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .belief .cand .track { height: 8px; background: #8882; border-radius: 4px; overflow: hidden; }
  .belief .cand .fill { display: block; height: 100%; background: #6cf; }
  .belief .cand .p { text-align: right; opacity: .7; font-variant-numeric: tabular-nums; }
  .prof { margin: 0 0 16px; }
  .prof summary { font-size: 12px; opacity: .7; }
  .prof .row { font-size: 12px; margin: 6px 0; opacity: .9; }
  .qeig { margin-top: 10px; }
  .qeig .qhead { font-size: 11px; opacity: .55; margin-bottom: 4px; }
  .qeig .qrow { display: grid; grid-template-columns: 14px 1fr 70px 40px; align-items: center; gap: 6px; font-size: 11px; padding: 2px 0; }
  .qeig .qrow.chosen { font-weight: 700; }
  .qeig .mark { opacity: .7; }
  .qeig .qt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qeig .qbar { height: 6px; background: #8882; border-radius: 3px; overflow: hidden; }
  .qeig .qfill { display: block; height: 100%; background: #a78bfa; }
  .qeig .qe { text-align: right; opacity: .7; font-variant-numeric: tabular-nums; }
  .tbar { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: center; }
  .tbar .tl { font-size: 12px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`

function RunNav(props: { activeRun?: string; activeGame?: string }) {
  const runs = listRuns()
  if (!runs.length) return <div class="meta">logs/ に run がありません</div>
  return (
    <>
      {runs.map((r) => {
        const active = r.label === props.activeRun
        return (
          <div>
            <a href={`/run/${encodeURIComponent(r.label)}`} class={active ? 'active' : ''}>
              {r.label}
              <div class="meta">
                {r.summary ? `${r.summary.games}ゲーム / 解決${r.summary.solved} / 引分${r.summary.draws}` : '(summary なし)'}
              </div>
            </a>
            {active ? (
              <div class="games">
                {listGames(r.label).map((gm) => {
                  const f = gameFileName(gm)
                  return (
                    <a href={`/run/${encodeURIComponent(r.label)}/game/${f}`} class={f === props.activeGame ? 'active' : ''}>
                      {gm.pair[0]}×{gm.pair[1]} #{gm.replicaIndex + 1} {gm.solved ? `→${gm.winnerWord}(${gm.totalTurns})` : '引分'}
                    </a>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function TopicNav(props: { activeTopicKey?: string; activeRun?: string; activeGame?: string }) {
  const topics = groupTopics()
  if (!topics.length) return <div class="meta">お題がありません</div>
  return (
    <>
      {topics.map((t) => {
        const active = t.key === props.activeTopicKey
        const agg = aggregate(t.entries.map((e) => e.game))
        return (
          <div>
            <a href={`/topic/${encodeURIComponent(t.key)}?g=topic`} class={active ? 'active' : ''}>
              {t.label}
              <div class="meta">{agg.n}ゲーム / 解決{agg.solved}</div>
            </a>
            {active ? (
              <div class="games">
                {t.entries.map((e) => (
                  <a
                    href={`/run/${encodeURIComponent(e.run)}/game/${e.file}?g=topic`}
                    class={e.run === props.activeRun && e.file === props.activeGame ? 'active' : ''}
                  >
                    {e.run} {e.game.solved ? `→${e.game.winnerWord}(${e.game.totalTurns})` : '引分'}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function ModelNav(props: { activeName?: string }) {
  const ms = groupModels()
  if (!ms.length) return <div class="meta">モデル情報のあるゲームがありません</div>
  return (
    <>
      {ms.map((m) => {
        const a = modelAgg(m.obs)
        return (
          <a href={`/model/${encodeURIComponent(m.name)}?g=model`} class={m.name === props.activeName ? 'active' : ''}>
            {m.name}
            <div class="meta">{a.n}出場 / 勝率 {pct(a.winRate)}</div>
          </a>
        )
      })}
    </>
  )
}

function Layout(props: { group: G; activeRun?: string; activeTopicKey?: string; activeModel?: string; activeGame?: string; children: unknown }) {
  const g = props.group
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>testplay viewer</title>
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      </head>
      <body>
        <div class="wrap">
          <nav class="side">
            <h1>TESTPLAY</h1>
            <div class="gtoggle">
              <a href="/?g=run" class={g === 'run' ? 'on' : ''}>run別</a>
              <a href="/?g=topic" class={g === 'topic' ? 'on' : ''}>お題別</a>
              <a href="/?g=model" class={g === 'model' ? 'on' : ''}>モデル比較</a>
            </div>
            <div class="runs">
              {g === 'run' ? (
                <RunNav activeRun={props.activeRun} activeGame={props.activeGame} />
              ) : g === 'topic' ? (
                <TopicNav activeTopicKey={props.activeTopicKey} activeRun={props.activeRun} activeGame={props.activeGame} />
              ) : (
                <ModelNav activeName={props.activeModel} />
              )}
            </div>
          </nav>
          <main class="main">{props.children}</main>
        </div>
      </body>
    </html>
  )
}

const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444']
function Bar(props: { parts: { label: string; n: number }[]; total: number }) {
  if (props.total === 0) return null
  return (
    <div class="bar">
      {props.parts.map((p, i) =>
        p.n > 0 ? (
          <i style={`width:${(p.n / props.total) * 100}%;background:${p.label === '引き分け' ? '#6b7280' : COLORS[i % COLORS.length]}`}>
            {p.label} {p.n}
          </i>
        ) : null,
      )}
    </div>
  )
}

function SummaryView(props: { games: Game[]; showPosition?: boolean }) {
  const a = aggregate(props.games)
  const posParts = [...Object.entries(a.byPosition).map(([label, n]) => ({ label, n })), { label: '引き分け', n: a.draws }]
  // 語別の勝敗はお題ごとに1本のバーにする。語が競うのは同じお題の相手だけなので、
  // 別のお題の語を1本に混ぜると割合に意味がなくなる。
  const byTopic = new Map<string, { label: string; games: Game[] }>()
  for (const g of props.games) {
    const k = topicKey(g.pair)
    if (!byTopic.has(k)) byTopic.set(k, { label: topicLabel(g.pair), games: [] })
    byTopic.get(k)!.games.push(g)
  }
  const topics = [...byTopic.values()].sort((x, y) => x.label.localeCompare(y.label))
  return (
    <div>
      <div class="stat">
        <div><b>{a.n}</b><span>ゲーム</span></div>
        <div><b>{a.solved}</b><span>解決</span></div>
        <div><b>{a.draws}</b><span>引き分け</span></div>
        <div><b>{a.avgTurns ?? '–'}</b><span>解決時の平均ターン</span></div>
      </div>
      {props.showPosition ? (
        <>
          <div>先手 / 後手 / 引き分け</div>
          <Bar parts={posParts} total={a.n} />
        </>
      ) : null}
      <div>語別の勝ち / 引き分け{topics.length > 1 ? ' — お題ごと' : ''}</div>
      {topics.map((t) => {
        const ta = aggregate(t.games)
        const words = [...t.games[0].pair].sort()
        const parts = [...words.map((w) => ({ label: w, n: ta.byWord[w] || 0 })), { label: '引き分け', n: ta.draws }]
        return (
          <div class={topics.length > 1 ? 'tbar' : ''}>
            {topics.length > 1 ? <span class="tl">{t.label}</span> : null}
            <Bar parts={parts} total={ta.n} />
          </div>
        )
      })}
    </div>
  )
}

function Belief(props: { belief?: { word: string; prob: number }[] }) {
  const b = props.belief
  if (!b || !b.length) return null
  return (
    <div class="belief">
      {b.slice(0, 8).map((c) => (
        <div class="cand">
          <span class="w">{c.word}</span>
          <span class="track"><span class="fill" style={`width:${Math.round(c.prob * 100)}%`}></span></span>
          <span class="p">{Math.round(c.prob * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

function Questions(props: { questions?: { text: string; eig: number | null; chosen?: boolean }[] }) {
  const qs = props.questions
  if (!qs || !qs.length) return null
  // 古いログは EIG が計算不能(-Infinity→null)の行を含み得る。null は 0 として描画する。
  const eigOf = (q: { eig: number | null }) => q.eig ?? 0
  const maxE = Math.max(...qs.map(eigOf), 0.0001)
  return (
    <div class="qeig">
      <div class="qhead">候補質問と EIG(採用 = ●・バーは EIG の相対値)</div>
      {qs.map((q) => (
        <div class={`qrow ${q.chosen ? 'chosen' : ''}`}>
          <span class="mark">{q.chosen ? '●' : '○'}</span>
          <span class="qt">{q.text}</span>
          <span class="qbar"><span class="qfill" style={`width:${Math.round((eigOf(q) / maxE) * 100)}%`}></span></span>
          <span class="qe">{eigOf(q).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

// run 内のモデル別成績。run はモデル設定が揃っているので、モデル比較はここに置くのが最も意味を持つ
// (run を跨ぐと設定が変わり比較にならない)。別モデル対戦のゲームだけから集計する。
function RunModelSection(props: { games: Game[] }) {
  const hh = props.games.filter((g) => norm(g.thinkerModels?.['1']) !== norm(g.thinkerModels?.['2']))
  if (!hh.length) return null
  const models = [...new Set(hh.flatMap((g) => [norm(g.thinkerModels?.['1']), norm(g.thinkerModels?.['2'])]))].sort()
  const overall = new Map<string, { win: number; loss: number; draw: number; turns: number[] }>()
  const rows = new Map<string, { topicLabel: string; word: string; byModel: Map<string, { win: number; loss: number; draw: number }> }>()
  for (const g of hh) {
    for (const p of [1, 2] as const) {
      const m = norm(g.thinkerModels?.[String(p)])
      const word = g.pair[p - 1]
      const res: 'win' | 'loss' | 'draw' = !g.solved ? 'draw' : g.winner === p ? 'win' : 'loss'
      if (!overall.has(m)) overall.set(m, { win: 0, loss: 0, draw: 0, turns: [] })
      const o = overall.get(m)!
      o[res]++
      if (res === 'win') o.turns.push(g.totalTurns)
      const rk = topicKey(g.pair) + '::' + word
      if (!rows.has(rk)) rows.set(rk, { topicLabel: topicLabel(g.pair), word, byModel: new Map() })
      const r = rows.get(rk)!
      if (!r.byModel.has(m)) r.byModel.set(m, { win: 0, loss: 0, draw: 0 })
      r.byModel.get(m)![res]++
    }
  }
  const rowArr = [...rows.values()].sort((a, b) => a.topicLabel.localeCompare(b.topicLabel) || a.word.localeCompare(b.word))
  return (
    <div>
      <h3 style="margin:24px 0 8px;font-size:14px;opacity:.8">モデル別成績 — 別モデル対戦 {hh.length}ゲーム</h3>
      <table class="cmp">
        <thead>
          <tr><th>モデル</th><th class="num">勝</th><th class="num">敗</th><th class="num">分</th><th class="num">勝率</th><th class="num">勝利時平均手数</th></tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const o = overall.get(m)!
            const avg = o.turns.length ? Math.round((o.turns.reduce((a, b) => a + b, 0) / o.turns.length) * 10) / 10 : null
            return (
              <tr>
                <td>{m}</td>
                <td class="num">{o.win}</td>
                <td class="num">{o.loss}</td>
                <td class="num">{o.draw}</td>
                <td class="num">{o.win + o.loss ? Math.round((o.win / (o.win + o.loss)) * 100) + '%' : '–'}</td>
                <td class="num">{avg ?? '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style="margin-top:16px">単語ごとの成績 — 同じ行でモデルを見比べると条件が揃った比較になる</div>
      <table class="cmp">
        <thead>
          <tr><th>お題</th><th>持った単語</th>{models.map((m) => <th class="num">{m} の 勝-敗-分</th>)}</tr>
        </thead>
        <tbody>
          {rowArr.map((r) => (
            <tr>
              <td>{r.topicLabel}</td>
              <td>{r.word}</td>
              {models.map((m) => {
                const c = r.byModel.get(m)
                return <td class="num">{c ? `${c.win}-${c.loss}-${c.draw}` : '–'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GameReplay(props: { game: Game }) {
  const g = props.game
  return (
    <div>
      {g.profiles ? (
        <details class="prof">
          <summary>単語の意味(oracle が答える基準)</summary>
          <div class="row"><b>{g.words['1']}</b>: {g.profiles['1']}</div>
          <div class="row"><b>{g.words['2']}</b>: {g.profiles['2']}</div>
        </details>
      ) : null}
      <div class="legend">
        <span class="p1c">◀ P1 = {g.words['1']}{g.thinkerModels ? ` [${g.thinkerModels['1']}]` : ''}</span>
        <span class="mid">
          {g.solved ? `勝者 P${g.winner}(${g.winnerWord})・${g.totalTurns}手` : `引き分け・${g.totalTurns}手`}
          {' '}/ oracle {g.answererModel ?? '?'}
        </span>
        <span class="p2c">P2 = {g.words['2']}{g.thinkerModels ? ` [${g.thinkerModels['2']}]` : ''} ▶</span>
      </div>
      <div class="replay">
        {g.transcript.map((m) => {
          if (m.kind === 'guess') {
            return (
              <div class={`turn guess ${m.correct ? 'ok' : 'ng'} p${m.asker}`}>
                <div class="head">T{m.turn}・プレイヤー{m.asker} の推測</div>
                <div class="q">
                  「{m.word}」ですか? → {m.correct ? '正解 🎉' : '不正解'}
                </div>
                {m.reasoning ? (
                  <details>
                    <summary>思考</summary>
                    <p>{m.reasoning}</p>
                    <Belief belief={m.belief} />
                  </details>
                ) : null}
              </div>
            )
          }
          return (
            <div class={`turn p${m.asker}`}>
              <div class="head">
                T{m.turn}・プレイヤー{m.asker} が質問 → プレイヤー{m.answerer} が回答
              </div>
              <div class="q">
                {m.text}
                <span class={`ans ${m.answer}`}>{m.answer}</span>
              </div>
              {m.reasoning ? (
                <details>
                  <summary>思考</summary>
                  <p>{m.reasoning}</p>
                  <Belief belief={m.belief} />
                  <Questions questions={m.questions} />
                </details>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ルーティング ────────────────────────────────────────────
const app = new Hono()
const page = (node: unknown) => '<!DOCTYPE html>' + String(node)

// 画像保存ライブラリ(modern-screenshot UMD・グローバル modernScreenshot)を vendor 配信
const VENDOR_MS = resolve(import.meta.dirname, '..', 'node_modules', 'modern-screenshot', 'dist', 'index.js')
let vendorCache: string | null = null
app.get('/vendor/modern-screenshot.js', (c) => {
  try {
    vendorCache = vendorCache ?? readFileSync(VENDOR_MS, 'utf8')
  } catch {
    return c.notFound()
  }
  return c.body(vendorCache, 200, { 'content-type': 'application/javascript; charset=utf-8' })
})

// クライアントJS: 思考(details)の一括開閉 + #capture を丸ごと PNG 化して保存
const CLIENT_JS = (name: string) => `
window.__IMG__ = ${JSON.stringify(name)};
function toggleAll(open){ document.querySelectorAll('#capture details').forEach(function(d){ d.open = open }); }
async function saveImage(){
  var node = document.getElementById('capture');
  try {
    var url = await modernScreenshot.domToPng(node, { scale: 2, backgroundColor: '#0f1115' });
    var a = document.createElement('a'); a.download = (window.__IMG__ || 'testplay') + '.png'; a.href = url; a.click();
  } catch (e) { alert('画像化に失敗: ' + (e && e.message ? e.message : e)); }
}
`

function parseG(c: { req: { query: (k: string) => string | undefined } }): G {
  const q = c.req.query('g')
  return q === 'topic' ? 'topic' : q === 'model' ? 'model' : 'run'
}

app.get('/', (c) => {
  const g = parseG(c)
  const what = g === 'topic' ? 'お題' : g === 'model' ? 'モデル比較' : 'run'
  return c.html(page(<Layout group={g}><div class="empty">左から {what} を選んでください。</div></Layout>))
})

app.get('/run/:label', (c) => {
  const label = c.req.param('label')
  if (!safe(label) || !existsSync(join(LOGS_DIR, label))) return c.notFound()
  const games = listGames(label)
  const agg = aggregate(games)
  return c.html(
    page(
      <Layout group="run" activeRun={label}>
        <div class="crumb">run / {label}</div>
        <h2>{label}</h2>
        <SummaryView games={games} showPosition={true} />
        <RunModelSection games={games} />
      </Layout>,
    ),
  )
})

app.get('/topic/:key', (c) => {
  const key = c.req.param('key')
  const topic = groupTopics().find((t) => t.key === key)
  if (!topic) return c.notFound()
  const topicGames = topic.entries.map((e) => e.game)
  const agg = aggregate(topicGames)
  return c.html(
    page(
      <Layout group="topic" activeTopicKey={key}>
        <div class="crumb">お題 / {topic.label}</div>
        <h2>{topic.label}</h2>
        <SummaryView games={topicGames} showPosition={false} />
        <h3 style="margin:20px 0 8px;font-size:14px;opacity:.8">全プレイ({agg.n})— run 横断</h3>
        <div>
          {topic.entries.map((e) => (
            <a
              style="display:block;padding:7px 12px;border:1px solid var(--bd);border-radius:8px;margin:5px 0;text-decoration:none;color:inherit"
              href={`/run/${encodeURIComponent(e.run)}/game/${e.file}?g=topic`}
            >
              {e.run} — {e.game.solved ? `勝者 ${e.game.winnerWord}(${e.game.totalTurns}手)` : `引き分け(${e.game.totalTurns}手)`}
            </a>
          ))}
        </div>
      </Layout>,
    ),
  )
})

app.get('/model/:name', (c) => {
  const name = c.req.param('name')
  const m = groupModels().find((x) => x.name === name)
  if (!m) return c.notFound()
  const a = modelAgg(m.obs)
  const cells = modelCells(m.obs)
  return c.html(
    page(
      <Layout group="model" activeModel={name}>
        <div class="crumb">モデル</div>
        <h2>{name}</h2>
        <div class="stat">
          <div><b>{pct(a.winRate)}</b><span>勝率</span></div>
          <div><b>{a.wins}-{a.losses}</b><span>勝-負 / 引分 {a.draws}</span></div>
          <div><b>{a.avgTurns ?? '–'}</b><span>勝った時の平均手数</span></div>
          <div><b>{a.n}</b><span>出場</span></div>
        </div>
        <div>run × お題 × 担当単語 × 相手 ごとの成績 — run が違えば設定も違うので合算していない</div>
        <table class="cmp">
          <thead>
            <tr>
              <th>run</th><th>お題</th><th>担当単語</th><th>相手</th>
              <th class="num">勝</th><th class="num">負</th><th class="num">分</th><th class="num">勝率</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c2) => (
              <tr>
                <td><a href={`/run/${encodeURIComponent(c2.run)}`} style="color:inherit">{c2.run}</a></td>
                <td>{c2.topicLabel}</td>
                <td>{c2.word}</td>
                <td>{c2.opponent}</td>
                <td class="num">{c2.win}</td>
                <td class="num">{c2.loss}</td>
                <td class="num">{c2.draw}</td>
                <td class="num">{c2.win + c2.loss ? Math.round((c2.win / (c2.win + c2.loss)) * 100) + '%' : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="meta" style="margin-top:10px">このページはモデルの出場履歴の索引。設定の揃った比較は各 run のサマリにある「モデル別成績」で見る(run 列のリンクから飛べる)。</div>
      </Layout>,
    ),
  )
})

app.get('/run/:label/game/:file', (c) => {
  const label = c.req.param('label')
  const file = c.req.param('file')
  if (!safe(label) || !safe(file)) return c.notFound()
  const game = readJson<Game>(join(LOGS_DIR, label, file))
  if (!game) return c.notFound()
  const g = parseG(c)
  return c.html(
    page(
      <Layout
        group={g}
        activeRun={label}
        activeGame={file}
        activeTopicKey={g === 'topic' ? topicKey(game.pair) : undefined}
      >
        <div class="crumb">
          {g === 'topic' ? `お題 / ${topicLabel(game.pair)}` : `run / ${label}`} / #{game.replicaIndex + 1}
        </div>
        <div id="toolbar" class="toolbar">
          <button onclick="toggleAll(true)">思考をすべて開く</button>
          <button onclick="toggleAll(false)">すべて閉じる</button>
          <button onclick="saveImage()">画像で保存</button>
        </div>
        <div id="capture">
          <h2>{game.pair[0]} × {game.pair[1]}</h2>
          <GameReplay game={game} />
        </div>
        <script src="/vendor/modern-screenshot.js"></script>
        <script dangerouslySetInnerHTML={{ __html: CLIENT_JS(`${label}-${game.pair[0]}x${game.pair[1]}-${game.replicaIndex + 1}`) }} />
      </Layout>,
    ),
  )
})

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`testplay viewer → http://localhost:${info.port}  (logs: ${LOGS_DIR})`)
})
