import type { Child, FC } from "hono/jsx";
import { type Verdict, VERDICT_KEYS, WORDS_PER_TOPIC } from "./config";
import type { Topic } from "./repo";

const VERDICT_LABEL: Record<Verdict, { label: string; color: string }> = {
  good: { label: "良い", color: "#16a34a" },
  close: { label: "惜しい", color: "#d97706" },
  too_close: { label: "近すぎ", color: "#ef4444" },
  predictable: { label: "予測可能", color: "#db2777" },
  flat: { label: "平凡", color: "#6b7280" },
  too_far: { label: "遠すぎ", color: "#6366f1" },
  nonsense: { label: "意味不明", color: "#475569" },
};

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6;
         background: #f6f7f9; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181d; color: #e8e8e8; }
    .card, .chip, input, textarea { background: #21242b !important; color: #e8e8e8; border-color: #3a3f4b !important; }
    a { color: #7eb6ff; }
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 0 0 8px; }
  a { color: #2563eb; text-decoration: none; } a:hover { text-decoration: underline; }
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
  .chip { display: inline-block; background: #eef1f5; border: 1px solid #e3e6ea; border-radius: 6px; padding: 2px 8px; margin: 2px 4px 2px 0; font-size: 14px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .muted { color: #8a8f98; font-size: 13px; }
  .score { font-variant-numeric: tabular-nums; font-weight: 600; }
  input, textarea, button, select { font: inherit; }
  input[type=text], textarea, select { border: 1px solid #cdd3db; border-radius: 7px; padding: 7px 9px; background: #fff; }
  textarea { width: 100%; min-height: 70px; resize: vertical; }
  button { border: 0; border-radius: 7px; padding: 7px 14px; cursor: pointer; background: #2563eb; color: #fff; font-weight: 600; }
  button.ghost { background: transparent; color: #ef4444; font-weight: 500; border: 1px solid #ef4444; padding: 4px 10px; }
  button.sub { background: #4b5563; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 8px 6px; border-bottom: 1px solid #e3e6ea; text-align: left; vertical-align: top; }
  th { font-size: 12px; color: #8a8f98; text-transform: uppercase; }
  label { display: block; font-size: 13px; color: #8a8f98; margin: 8px 0 2px; }
  .acc { font-size: 12px; padding: 1px 8px; border-radius: 999px; color: #fff; }
`;

export const Layout: FC<{ title: string; children?: Child }> = ({
  title,
  children,
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
    </head>
    <body>
      <div class="wrap">{children}</div>
    </body>
  </html>
);

const ScoreCell: FC<{ t: Topic }> = ({ t }) =>
  t.score === null ? (
    <span class="chip" style="background:#fde68a;color:#92400e;border:0">未評価</span>
  ) : (
    <span class="row" style="gap:6px">
      <span class="score">{t.score.toFixed(2)}</span>
      <span
        class="acc"
        style={`background:${t.accepted ? "#16a34a" : "#9ca3af"}`}
      >
        {t.accepted ? "採用" : "却下"}
      </span>
    </span>
  );

const VerdictChip: FC<{ verdict: string }> = ({ verdict }) => {
  const v = VERDICT_LABEL[verdict as Verdict];
  return (
    <span class="chip" style={`color:#fff;border:0;background:${v?.color ?? "#6b7280"}`}>
      {v?.label ?? verdict}
    </span>
  );
};

export const TopicsListPage: FC<{ topics: Topic[] }> = ({ topics }) => (
  <Layout title="お題コックピット">
    <div class="row">
      <h1>ワードニンジャ お題コックピット</h1>
      <span class="spacer" />
      <a href="/review">⚡ 高速評価</a>
      <span class="muted">{topics.length} 件</span>
    </div>

    <div class="card">
      <h2>お題を追加</h2>
      <form method="post" action="/topics">
        <label>単語（{WORDS_PER_TOPIC}語ちょうど・1行に1語、または カンマ区切り）</label>
        <textarea name="words" placeholder={"うどん\nそば"} />
        <div style="margin-top:10px"><button type="submit">追加</button></div>
      </form>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>お題</th>
            <th style="width:120px">score</th>
            <th style="width:64px">評価</th>
            <th style="width:48px" />
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr>
              <td>
                <a href={`/topics/${t.id}`}>
                  {t.words.map((w) => (
                    <span class="chip">{w.text}</span>
                  ))}
                </a>
              </td>
              <td><ScoreCell t={t} /></td>
              <td>{t.evaluations.length}</td>
              <td><a href={`/topics/${t.id}`}>詳細</a></td>
            </tr>
          ))}
          {topics.length === 0 && (
            <tr>
              <td colspan={4} class="muted">
                まだお題がありません。上のフォームか LLM(API)で追加してください。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Layout>
);

export const TopicDetailPage: FC<{ topic: Topic }> = ({ topic }) => (
  <Layout title={`お題 ${topic.id}`}>
    <div class="row">
      <a href="/">← 一覧</a>
      <span class="spacer" />
      <span class="muted">作成: {topic.createdAt}</span>
    </div>
    <div class="row">
      <h1 style="margin:0">{topic.id}</h1>
      <ScoreCell t={topic} />
    </div>

    <div class="card">
      <h2>単語</h2>
      <form method="post" action={`/topics/${topic.id}/words`}>
        <textarea name="words">{topic.words.map((w) => w.text).join("\n")}</textarea>
        <div style="margin-top:10px"><button type="submit">単語を保存</button></div>
      </form>
    </div>

    <div class="card">
      <h2>評価</h2>
      {topic.evaluations.length === 0 && <p class="muted">まだ評価がありません。</p>}
      {topic.evaluations.map((e) => (
        <div class="row" style="border-bottom:1px solid #e3e6ea; padding:6px 0">
          <span class="muted" style="width:90px">{e.evaluator}</span>
          <VerdictChip verdict={e.verdict} />
          <span class="muted">{e.reason}</span>
          <span class="spacer" />
          <form method="post" action={`/evaluations/${e.id}/delete`}>
            <button class="ghost" type="submit">削除</button>
          </form>
        </div>
      ))}

      <form method="post" action={`/topics/${topic.id}/eval`} style="margin-top:14px">
        <div class="row">
          <div>
            <label>評価者</label>
            <input type="text" name="evaluator" value="human" required />
          </div>
          <div>
            <label>判定</label>
            <select name="verdict">
              {VERDICT_KEYS.map((k) => (
                <option value={k}>{VERDICT_LABEL[k].label}</option>
              ))}
            </select>
          </div>
        </div>
        <label>メモ（任意）</label>
        <textarea name="reason" style="min-height:48px" />
        <div style="margin-top:10px"><button class="sub" type="submit">評価を追加</button></div>
      </form>
    </div>

    <div class="card">
      <form
        method="post"
        action={`/topics/${topic.id}/delete`}
        onsubmit="return confirm('このお題を削除しますか？')"
      >
        <button class="ghost" type="submit">このお題を削除</button>
      </form>
    </div>
  </Layout>
);

// 高速評価: 人評価が無いお題を1件ずつ、キーで判定（=人評価を追加）。
const REVIEW_JS = `
const KEY = ${JSON.stringify(
  Object.fromEntries(VERDICT_KEYS.map((v, i) => [String(i + 1), v])),
)};
const esc = s => s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
let queue = [], idx = 0;
async function load() {
  const all = await (await fetch('/api/topics')).json();
  queue = all.filter(t => !t.evaluations.some(e => e.evaluator === 'human'));
  idx = 0; render();
}
function render() {
  const card = document.getElementById('card');
  document.getElementById('progress').textContent = idx + ' / ' + queue.length;
  if (idx >= queue.length) {
    card.innerHTML = '<div class="done">未評価のお題がありません 🎉<br><a href="/">← 一覧へ</a></div>';
    return;
  }
  const t = queue[idx];
  card.innerHTML = '<div class="pair">' +
    t.words.map(w => '<span class="w">' + esc(w.text) + '</span>').join('<span class="vs">×</span>') +
    '</div>';
}
function rate(verdict) {
  if (idx >= queue.length) return;
  const t = queue[idx];
  idx++; render();
  fetch('/api/evaluations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topicId: t.id, evaluator: 'human', verdict })
  });
}
document.addEventListener('keydown', e => {
  if (KEY[e.key]) { e.preventDefault(); rate(KEY[e.key]); }
  else if (e.key === 'u' && idx > 0) { idx--; render(); }
});
load();
`;

export const ReviewPage: FC = () => (
  <Layout title="高速評価">
    <style
      dangerouslySetInnerHTML={{
        __html: `
        #card { min-height: 200px; display:flex; align-items:center; justify-content:center; margin: 24px 0; }
        .pair { display:flex; align-items:center; gap:18px; flex-wrap:wrap; justify-content:center; }
        .pair .w { font-size: 40px; font-weight: 700; }
        .pair .vs { font-size: 22px; color:#8a8f98; }
        .done { font-size: 20px; text-align:center; line-height:2; }
        .rv-btns { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .rv-btns button { font-size:16px; padding:14px 20px; border-radius:10px; color:#fff; }
        .keyhint { color:#8a8f98; text-align:center; margin-top:14px; font-size:13px; }
      `,
      }}
    />
    <div class="row">
      <a href="/">← 一覧</a>
      <h1 style="margin:0">高速評価</h1>
      <span class="spacer" />
      <span class="muted" id="progress">…</span>
    </div>
    <div id="card" />
    <div class="rv-btns">
      {VERDICT_KEYS.map((k, i) => (
        <button style={`background:${VERDICT_LABEL[k].color}`} onclick={`rate('${k}')`}>
          {i + 1} · {VERDICT_LABEL[k].label}
        </button>
      ))}
    </div>
    <p class="keyhint">
      {VERDICT_KEYS.map((k, i) => `${i + 1}=${VERDICT_LABEL[k].label}`).join(" / ")} / u = 戻る
      <br />
      押すと人評価を追加して次へ（score は自動再計算、良い/惜しいが採用圏）
    </p>
    <script dangerouslySetInnerHTML={{ __html: REVIEW_JS }} />
  </Layout>
);
