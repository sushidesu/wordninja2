import type { Child, FC } from "hono/jsx";
import {
  type Candidate,
  humanScore,
  type TopicSetDetail,
  type Verdict,
  WORDS_PER_TOPIC,
} from "./repo";

// 番号キー(1〜5)順。良い/惜しい=登録対象、残りは没の理由。
const VERDICTS: { key: Verdict; label: string; color: string }[] = [
  { key: "good", label: "良い", color: "#16a34a" },
  { key: "close", label: "惜しい", color: "#d97706" },
  { key: "too_close", label: "近すぎ", color: "#ef4444" },
  { key: "predictable", label: "予測可能", color: "#db2777" },
  { key: "flat", label: "平凡", color: "#6b7280" },
  { key: "too_far", label: "遠すぎ", color: "#6366f1" },
  { key: "nonsense", label: "意味不明", color: "#475569" },
];

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
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 10px;
          padding: 14px 16px; margin: 12px 0; }
  .chip { display: inline-block; background: #eef1f5; border: 1px solid #e3e6ea;
          border-radius: 6px; padding: 2px 8px; margin: 2px 4px 2px 0; font-size: 14px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .muted { color: #8a8f98; font-size: 13px; }
  .score { font-variant-numeric: tabular-nums; font-weight: 600; }
  .badge { font-size: 12px; padding: 1px 7px; border-radius: 999px;
           background: #fde68a; color: #92400e; }
  input, textarea, button { font: inherit; }
  input[type=text], input[type=number], textarea {
    border: 1px solid #cdd3db; border-radius: 7px; padding: 7px 9px; background: #fff; }
  textarea { width: 100%; min-height: 84px; resize: vertical; }
  button { border: 0; border-radius: 7px; padding: 7px 14px; cursor: pointer;
           background: #2563eb; color: #fff; font-weight: 600; }
  button.ghost { background: transparent; color: #ef4444; font-weight: 500;
                 border: 1px solid #ef4444; padding: 4px 10px; }
  button.sub { background: #4b5563; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 8px 6px; border-bottom: 1px solid #e3e6ea; text-align: left; vertical-align: top; }
  th { font-size: 12px; color: #8a8f98; text-transform: uppercase; }
  label { display: block; font-size: 13px; color: #8a8f98; margin: 8px 0 2px; }
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

const ScoreCell: FC<{ set: TopicSetDetail }> = ({ set }) => {
  const s = humanScore(set);
  return s < 0 ? (
    <span class="badge">未評価</span>
  ) : (
    <span class="score">{s.toFixed(2)}</span>
  );
};

const CandidateCard: FC<{ candidate: Candidate }> = ({ candidate }) => (
  <div class="card" style="border-color:#a855f7">
    <div class="row">
      <span class="chip" style="background:#f3e8ff;border-color:#e9d5ff">候補</span>
      {candidate.score !== null && (
        <span
          class="score"
          style={`padding:1px 8px;border-radius:999px;color:#fff;background:${
            candidate.score >= 0.8
              ? "#16a34a"
              : candidate.score >= 0.6
                ? "#d97706"
                : "#ef4444"
          }`}
        >
          予測 {candidate.score.toFixed(2)}
        </span>
      )}
      <span class="muted">{candidate.source}</span>
      <span
        class="muted"
        style={
          candidate.words.length === WORDS_PER_TOPIC ? "" : "color:#ef4444"
        }
      >
        {candidate.words.length} 語
      </span>
      {candidate.verdict !== null && (
        <span
          class="chip"
          style={`color:#fff;border:0;background:${
            VERDICTS.find((v) => v.key === candidate.verdict)?.color
          }`}
        >
          {VERDICTS.find((v) => v.key === candidate.verdict)?.label}
        </span>
      )}
      {candidate.vibe && (
        <span class="chip" style="color:#fff;border:0;background:#a855f7">
          ★ 雰囲気
        </span>
      )}
      <span class="spacer" />
      <span class="muted">{candidate.createdAt}</span>
    </div>
    <form method="post" action={`/candidates/${candidate.id}`}>
      <label>
        単語（登録は{WORDS_PER_TOPIC}語ちょうど・1行に1語、または カンマ区切り）
      </label>
      <textarea name="words">{candidate.words.join("\n")}</textarea>
      <label>メモ</label>
      <textarea name="note" style="min-height:44px">{candidate.note ?? ""}</textarea>
      <div class="row" style="margin-top:10px">
        <button type="submit" formaction={`/candidates/${candidate.id}/register`}>
          登録
        </button>
        <button type="submit" class="sub">候補を更新</button>
        <span class="spacer" />
        <button
          type="submit"
          class="ghost"
          formaction={`/candidates/${candidate.id}/delete`}
        >
          却下
        </button>
      </div>
    </form>

    <div
      class="row"
      style="margin-top:12px;padding-top:10px;border-top:1px solid #e3e6ea"
    >
      <span class="muted">判定:</span>
      {VERDICTS.map((v) => (
        <form method="post" action={`/candidates/${candidate.id}/verdict`}>
          <input type="hidden" name="current" value={candidate.verdict ?? ""} />
          <button
            type="submit"
            name="verdict"
            value={v.key}
            style={`padding:4px 12px;font-weight:600;border:1px solid ${v.color};background:${
              candidate.verdict === v.key ? v.color : "transparent"
            };color:${candidate.verdict === v.key ? "#fff" : v.color}`}
          >
            {v.label}
          </button>
        </form>
      ))}
      <span class="spacer" />
      <form method="post" action={`/candidates/${candidate.id}/vibe`}>
        <input type="hidden" name="current" value={candidate.vibe ? "1" : "0"} />
        <button
          type="submit"
          title="雰囲気◎（判定と独立）"
          style={`padding:4px 12px;font-weight:600;border:1px solid #a855f7;background:${
            candidate.vibe ? "#a855f7" : "transparent"
          };color:${candidate.vibe ? "#fff" : "#a855f7"}`}
        >
          ★ 雰囲気
        </button>
      </form>
    </div>
    <form method="post" action={`/candidates/${candidate.id}/feedback`}>
      <label>フィードバック（惜しい点・直したい所など）</label>
      <textarea name="feedback" style="min-height:44px">
        {candidate.feedback ?? ""}
      </textarea>
      <div style="margin-top:8px">
        <button type="submit" class="sub">フィードバック保存</button>
      </div>
    </form>
  </div>
);

export const SetsListPage: FC<{
  sets: TopicSetDetail[];
  candidates: Candidate[];
}> = ({ sets, candidates }) => (
  <Layout title="お題コックピット">
    <div class="row">
      <h1>ワードニンジャ お題コックピット</h1>
      <span class="spacer" />
      <a href="/review">⚡ 高速評価</a>
      <span class="muted">{sets.length} セット</span>
    </div>

    {candidates.length > 0 && (
      <>
        <h2 style="margin-top:18px">候補（未登録） {candidates.length}</h2>
        {candidates.map((candidate) => (
          <CandidateCard candidate={candidate} />
        ))}
      </>
    )}

    <div class="card">
      <h2>お題を追加</h2>
      <form method="post" action="/sets">
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
            <th style="width:64px">語数</th>
            <th style="width:90px">人評価</th>
            <th style="width:64px">評価数</th>
            <th style="width:64px" />
          </tr>
        </thead>
        <tbody>
          {sets.map((set) => (
            <tr>
              <td>
                <a href={`/sets/${set.id}`}>
                  <strong>{set.id}</strong>
                </a>
                <div>
                  {set.words.map((w) => (
                    <span class="chip">{w.text}</span>
                  ))}
                </div>
              </td>
              <td
                style={
                  set.words.length === WORDS_PER_TOPIC
                    ? ""
                    : "color:#ef4444;font-weight:600"
                }
              >
                {set.words.length}
              </td>
              <td>
                <ScoreCell set={set} />
              </td>
              <td>{set.evaluations.length}</td>
              <td>
                <a href={`/sets/${set.id}`}>詳細</a>
              </td>
            </tr>
          ))}
          {sets.length === 0 && (
            <tr>
              <td colspan={5} class="muted">
                まだお題がありません。上のフォームか sub-agent で追加してください。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </Layout>
);

// 高速レビュー: キーボードで1ペアずつ即判定・自動送り・リロード無し。
// 「近すぎ」を主要な却下にする非対称評価（遠さは許容）。
const REVIEW_JS = `
const KEY = ${JSON.stringify(
  Object.fromEntries(VERDICTS.map((v, i) => [String(i + 1), v.key])),
)};
const esc = s => s.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
let queue = [], idx = 0;

async function load() {
  const all = await (await fetch('/api/candidates')).json();
  queue = all.filter(c => c.verdict === null);
  idx = 0; render();
}
function render() {
  const card = document.getElementById('card');
  const prog = document.getElementById('progress');
  if (idx >= queue.length) {
    prog.textContent = queue.length + ' / ' + queue.length;
    card.innerHTML = queue.length
      ? '<div class="done">全部評価しました 🎉<br><a href="/">← 一覧へ</a></div>'
      : '<div class="done">未評価の候補がありません<br><a href="/">← 一覧へ</a></div>';
    return;
  }
  prog.textContent = idx + ' / ' + queue.length;
  const c = queue[idx];
  card.innerHTML = '<div class="pair">' +
    c.words.map(w => '<span class="w">' + esc(w) + '</span>').join('<span class="vs">×</span>') +
    '</div>' +
    '<div class="vibe-ind">' + (c.vibe ? '★ 雰囲気◎' : '') + '</div>';
}
function rate(verdict) {
  if (idx >= queue.length) return;
  const c = queue[idx];
  idx++; render(); // 体感を最優先して先に進める（保存は非同期）
  fetch('/api/candidates/' + c.id + '/feedback', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verdict })
  });
}
function toggleVibe() { // 判定とは独立。進めない
  if (idx >= queue.length) return;
  const c = queue[idx];
  c.vibe = !c.vibe; render();
  fetch('/api/candidates/' + c.id + '/feedback', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vibe: c.vibe })
  });
}
document.addEventListener('keydown', e => {
  if (KEY[e.key]) { e.preventDefault(); rate(KEY[e.key]); }
  else if (e.key === 'v') { e.preventDefault(); toggleVibe(); }
  else if (e.key === 'u' && idx > 0) { idx--; render(); } // 戻る（再判定で上書き）
});
load();
`;

export const ReviewPage: FC = () => (
  <Layout title="高速評価">
    <style
      dangerouslySetInnerHTML={{
        __html: `
        .rv-head { display:flex; align-items:center; gap:12px; }
        #card { min-height: 200px; display:flex; align-items:center; justify-content:center;
                margin: 24px 0; }
        .pair { display:flex; align-items:center; gap:18px; flex-wrap:wrap; justify-content:center; }
        .pair .w { font-size: 40px; font-weight: 700; }
        .pair .vs { font-size: 22px; color:#8a8f98; }
        .done { font-size: 20px; text-align:center; line-height:2; }
        .rv-btns { display:flex; gap:10px; justify-content:center; }
        .rv-btns { flex-wrap: wrap; }
        .rv-btns button { font-size:16px; padding:14px 20px; border-radius:10px; color:#fff; }
        .vibe-ind { text-align:center; min-height:24px; margin-top:10px; color:#a855f7; font-weight:700; }
        .keyhint { color:#8a8f98; text-align:center; margin-top:14px; font-size:13px; }
      `,
      }}
    />
    <div class="rv-head">
      <a href="/">← 一覧</a>
      <h1 style="margin:0">高速評価</h1>
      <span class="spacer" />
      <span class="muted" id="progress">…</span>
    </div>

    <div id="card" />

    <div class="rv-btns">
      {VERDICTS.map((v, i) => (
        <button
          style={`background:${v.color}`}
          onclick={`rate('${v.key}')`}
        >
          {i + 1} · {v.label}
        </button>
      ))}
      <button style="background:#a855f7" onclick="toggleVibe()">
        v · ★雰囲気
      </button>
    </div>
    <p class="keyhint">
      {VERDICTS.map((v, i) => `${i + 1}=${v.label}`).join(" / ")} / v = ★雰囲気◎（独立トグル） / u = 戻る
      <br />
      数字キーで即保存して次へ（良い・惜しいが登録対象）。雰囲気は判定と別で残せる
    </p>

    <script dangerouslySetInnerHTML={{ __html: REVIEW_JS }} />
  </Layout>
);

export const SetDetailPage: FC<{ set: TopicSetDetail }> = ({ set }) => (
  <Layout title={`お題 ${set.id}`}>
    <div class="row">
      <a href="/">← 一覧</a>
      <span class="spacer" />
      <span class="muted">作成: {set.createdAt}</span>
    </div>
    <h1>{set.id}</h1>

    <div class="card">
      <h2>
        単語{" "}
        <span class={set.words.length === WORDS_PER_TOPIC ? "muted" : ""} style={set.words.length === WORDS_PER_TOPIC ? "" : "color:#ef4444"}>
          ({set.words.length}/{WORDS_PER_TOPIC})
        </span>
      </h2>
      <form method="post" action={`/sets/${set.id}/words`}>
        <textarea name="words">
          {set.words.map((w) => w.text).join("\n")}
        </textarea>
        <div style="margin-top:10px"><button type="submit">単語を保存</button></div>
      </form>
    </div>

    <div class="card">
      <h2>評価</h2>
      {set.evaluations.length === 0 && (
        <p class="muted">まだ評価がありません。</p>
      )}
      {set.evaluations.map((e) => (
        <div class="row" style="border-bottom:1px solid #e3e6ea; padding:6px 0">
          <span class="chip">{e.source}</span>
          <span class="score">{e.score.toFixed(2)}</span>
          <span class="muted">{e.note}</span>
          <span class="spacer" />
          <form method="post" action={`/sets/${set.id}/eval/${e.source}/delete`}>
            <button class="ghost" type="submit">削除</button>
          </form>
        </div>
      ))}

      <form method="post" action={`/sets/${set.id}/eval`} style="margin-top:14px">
        <div class="row">
          <div>
            <label>評価者 / 基準 (source)</label>
            <input type="text" name="source" value="human" required />
          </div>
          <div>
            <label>スコア (0.0〜1.0)</label>
            <input
              type="number"
              name="score"
              min="0"
              max="1"
              step="0.05"
              required
            />
          </div>
        </div>
        <label>メモ（任意・評価理由）</label>
        <textarea name="note" style="min-height:56px" />
        <div style="margin-top:10px">
          <button class="sub" type="submit">評価を保存</button>
        </div>
      </form>
    </div>

    <div class="card">
      <form
        method="post"
        action={`/sets/${set.id}/delete`}
        onsubmit="return confirm('このお題を削除しますか？')"
      >
        <button class="ghost" type="submit">このお題を削除</button>
      </form>
    </div>
  </Layout>
);
