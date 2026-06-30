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
}
type Game = {
  specIndex: number
  replicaIndex: number
  pair: [string, string]
  words: Record<string, string>
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

// ── 表示部品(Hono JSX, サーバサイドレンダリング)──────────────
const STYLE = `
  :root { color-scheme: light dark; --bd: #8883; --mut: #8889; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.6 -apple-system, "Hiragino Sans", system-ui, sans-serif; }
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
  .ans.わからない { background: #f59e0b22; color: #b45309; }
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
`

function Layout(props: { activeRun?: string; activeGame?: string; children: unknown }) {
  const runs = listRuns()
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
            <h1>TESTPLAY RUNS</h1>
            <div class="runs">
              {runs.length === 0 ? <div class="meta">logs/ に run がありません</div> : null}
              {runs.map((r) => {
                const active = r.label === props.activeRun
                return (
                  <div>
                    <a href={`/run/${encodeURIComponent(r.label)}`} class={active ? 'active' : ''}>
                      {r.label}
                      {r.summary ? (
                        <div class="meta">
                          {r.summary.games}ゲーム / 解決{r.summary.solved} / 引分{r.summary.draws}
                        </div>
                      ) : (
                        <div class="meta">(summary なし)</div>
                      )}
                    </a>
                    {active ? (
                      <div class="games">
                        {listGames(r.label).map((g) => {
                          const f = gameFileName(g)
                          return (
                            <a
                              href={`/run/${encodeURIComponent(r.label)}/game/${f}`}
                              class={f === props.activeGame ? 'active' : ''}
                            >
                              {g.pair[0]}×{g.pair[1]}
                              {' '}#{g.replicaIndex + 1}{' '}
                              {g.solved ? `→${g.winnerWord}(${g.totalTurns})` : '引分'}
                            </a>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
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
          <i style={`width:${(p.n / props.total) * 100}%;background:${COLORS[i % COLORS.length]}`}>
            {p.label} {p.n}
          </i>
        ) : null,
      )}
    </div>
  )
}

function RunSummary(props: { label: string; summary: Summary | null }) {
  const s = props.summary
  if (!s) return <div class="empty">summary.json がありません</div>
  const posParts = Object.entries(s.byPosition).map(([label, n]) => ({ label, n }))
  const wordParts = Object.entries(s.byWord).map(([label, n]) => ({ label, n }))
  return (
    <div>
      <div class="stat">
        <div><b>{s.games}</b><span>ゲーム</span></div>
        <div><b>{s.solved}</b><span>解決</span></div>
        <div><b>{s.draws}</b><span>引き分け</span></div>
        <div><b>{s.avgTurns ?? '–'}</b><span>平均ターン(解決)</span></div>
      </div>
      <div>先手 / 後手</div>
      <Bar parts={posParts} total={s.solved} />
      <div>語別の勝利</div>
      <Bar parts={wordParts} total={s.solved} />
    </div>
  )
}

function GameReplay(props: { game: Game }) {
  const g = props.game
  return (
    <div>
      <div class="legend">
        <span class="p1c">◀ P1 = {g.words['1']}</span>
        <span class="mid">
          {g.solved ? `勝者 P${g.winner}(${g.winnerWord})・${g.totalTurns}手` : `引き分け・${g.totalTurns}手`}
          {' '}/ oracle {g.answererModel ?? '?'}
        </span>
        <span class="p2c">P2 = {g.words['2']} ▶</span>
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

app.get('/', (c) => c.html(page(<Layout><div class="empty">左から run を選んでください。</div></Layout>)))

app.get('/run/:label', (c) => {
  const label = c.req.param('label')
  if (!safe(label) || !existsSync(join(LOGS_DIR, label))) return c.notFound()
  const summary = readJson<{ summary: Summary }>(join(LOGS_DIR, label, 'summary.json'))?.summary ?? null
  return c.html(
    page(
      <Layout activeRun={label}>
        <div class="crumb">{label}</div>
        <h2>サマリ</h2>
        <RunSummary label={label} summary={summary} />
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
  return c.html(
    page(
      <Layout activeRun={label} activeGame={file}>
        <div class="crumb">
          {label} / {game.pair[0]}×{game.pair[1]} #{game.replicaIndex + 1}
        </div>
        <h2>{game.pair[0]} × {game.pair[1]}</h2>
        <GameReplay game={game} />
      </Layout>,
    ),
  )
})

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`testplay viewer → http://localhost:${info.port}  (logs: ${LOGS_DIR})`)
})
