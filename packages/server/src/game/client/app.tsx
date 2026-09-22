// hono/jsx/dom は、フラグメントを返すコンポーネントの後ろに兄弟要素があると、
// 再描画のたびにそのノード群を再挿入する。DOM は再挿入でフォーカスを失うため、
// 入力欄が1文字ごとにフォーカスを失う。各コンポーネントは単一要素を返すこと。
import { useEffect, useRef, useState } from "hono/jsx";
import { render } from "hono/jsx/dom";
import type { Action, Answer, PlayerView } from "@wordninja/rules";

// 型だけを借りる(実行時の zod は持ち込まない)。送る値の形はサーバー側で検証される。

const ANSWER_LABELS: Record<Answer, string> = {
  yes: "はい",
  no: "いいえ",
  partly: "部分的に",
  unknown: "わからない",
  correct: "正解",
};

type Settings = { teamCount: number; maxPlayers: number };
type Connection = { send: (action: Action) => void };

const useRoom = (code: string, player: string) => {
  const [view, setView] = useState<PlayerView | null>(null);
  const [rejected, setRejected] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${location.host}/api/game/rooms/${code}/ws?player=${encodeURIComponent(player)}`,
    );
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.type === "state") setView(msg.view);
      else setRejected((n) => n + 1);
    });
    socket.current = ws;
    return () => ws.close();
  }, [code, player]);

  return {
    view,
    rejected,
    conn: { send: (a: Action) => socket.current?.send(JSON.stringify(a)) },
  };
};

const Entry = ({
  onEnter,
}: {
  onEnter: (code: string, player: string, settings: Settings | null) => void;
}) => {
  const [player, setPlayer] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const [teamCount, setTeamCount] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const ready = player.trim().length > 0;

  const create = async () => {
    const res = await fetch("/api/game/rooms", { method: "POST" });
    const { code: newCode } = (await res.json()) as { code: string };
    onEnter(newCode, player.trim(), open ? { teamCount, maxPlayers } : null);
  };

  return (
    <div>
      <h1 style="margin-bottom:12px">ワードニンジャ</h1>
      <div class="card">
        <h2>あなたの名前</h2>
        <div class="row">
          <input
            type="text"
            value={player}
            placeholder="名前"
            onInput={(e: Event) => setPlayer((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <div class="card">
        <h2>部屋に入る</h2>
        <div class="row">
          <input
            type="text"
            value={code}
            placeholder="部屋コード"
            onInput={(e: Event) =>
              setCode((e.target as HTMLInputElement).value.toUpperCase())
            }
          />
          <button
            disabled={!ready || code.length === 0}
            onClick={() => onEnter(code, player.trim(), null)}
          >
            入る
          </button>
        </div>
      </div>

      <div class="card">
        <h2>部屋を建てる</h2>
        <div class="row">
          <button class="primary" disabled={!ready} onClick={create}>
            新しい部屋を作る
          </button>
          <button onClick={() => setOpen(!open)}>
            {open ? "設定を閉じる" : "設定"}
          </button>
        </div>
        {open && (
          <div style="margin-top:12px">
            <div class="row" style="margin-bottom:8px">
              <span style="min-width:96px">お題の種類</span>
              <input
                type="number"
                min="2"
                max="4"
                value={String(teamCount)}
                onInput={(e: Event) =>
                  setTeamCount(Number((e.target as HTMLInputElement).value))
                }
              />
              <span class="muted">同じ語を持つ人が仲間</span>
            </div>
            <div class="row">
              <span style="min-width:96px">人数の上限</span>
              <input
                type="number"
                min="2"
                max="16"
                value={String(maxPlayers)}
                onInput={(e: Event) =>
                  setMaxPlayers(Number((e.target as HTMLInputElement).value))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Lobby = ({
  view,
  player,
  conn,
}: {
  view: PlayerView;
  player: string;
  conn: Connection;
}) => {
  const [words, setWords] = useState<Record<string, string>>({});
  const isHost = view.host === player;
  const isPlayer = view.players.includes(player);
  const filled = view.players.every((p) => (words[p] ?? "").trim().length > 0);
  const kinds = new Set(view.players.map((p) => (words[p] ?? "").trim()).filter(Boolean));
  const kindsOk = kinds.size === view.teamCount;
  // 最初の質問者はランダム。規則は純関数に保つので乱択はここで行う。
  const pickFirstAsker = () =>
    view.players[Math.floor(Math.random() * view.players.length)];

  return (
    <div>
      <div class="card">
        <h2>参加者 {view.players.length} / {view.maxPlayers}</h2>
        {view.players.length === 0 ? (
          <div class="muted">まだ誰もいません</div>
        ) : (
          view.players.map((p) => (
            <span class={p === view.host ? "chip host" : "chip"}>
              {p}
              {p === view.host ? " (ホスト)" : ""}
            </span>
          ))
        )}
        {view.spectators.length > 0 && (
          <div style="margin-top:8px">
            <span class="muted">観戦 </span>
            {view.spectators.map((p) => (
              <span class="chip">{p}</span>
            ))}
          </div>
        )}
        <div class="row" style="margin-top:12px">
          {isPlayer ? (
            <button onClick={() => conn.send({ type: "spectate", player })}>
              観戦にまわる
            </button>
          ) : (
            <button onClick={() => conn.send({ type: "join", player })}>参加する</button>
          )}
        </div>
      </div>

      {isHost && view.players.length >= 2 && (
        <div class="card">
          <h2>お題を配る</h2>
          <div class="muted" style="margin-bottom:10px">
            同じ語を持つ人が仲間。語の種類はちょうど {view.teamCount} 種類にする。
          </div>
          {view.players.map((p) => (
            <div class="row" style="margin-bottom:6px">
              <span style="min-width:84px">{p}</span>
              <input
                type="text"
                value={words[p] ?? ""}
                placeholder="お題"
                onInput={(e: Event) =>
                  setWords({ ...words, [p]: (e.target as HTMLInputElement).value })
                }
              />
            </div>
          ))}
          <div class="row" style="margin-top:12px">
            <button
              class="primary"
              disabled={!filled || !kindsOk}
              onClick={() =>
                conn.send({
                  type: "deal",
                  by: player,
                  words: view.players.map((p) => ({ player: p, word: words[p].trim() })),
                  firstAsker: pickFirstAsker(),
                })
              }
            >
              配って開始
            </button>
            {filled && !kindsOk && (
              <span class="muted">いまは {kinds.size} 種類</span>
            )}
          </div>
        </div>
      )}

      {!isHost && (
        <div class="card">
          <div class="muted">ホストがお題を配るのを待っています</div>
        </div>
      )}

      {isHost && <Settings view={view} player={player} conn={conn} />}
    </div>
  );
};

/** 部屋設定。ホストのみ。建て直さずにいつでも変えられる。 */
const Settings = ({
  view,
  player,
  conn,
}: {
  view: PlayerView;
  player: string;
  conn: Connection;
}) => {
  const [open, setOpen] = useState(false);
  const [teamCount, setTeamCount] = useState(view.teamCount);
  const [maxPlayers, setMaxPlayers] = useState(view.maxPlayers);
  return (
    <div class="card">
      <div class="row">
        <h2 style="margin:0">部屋設定</h2>
        <span class="spacer" />
        <button onClick={() => setOpen(!open)}>{open ? "閉じる" : "変更"}</button>
      </div>
      {open && (
        <div style="margin-top:12px">
          <div class="row" style="margin-bottom:8px">
            <span style="min-width:96px">お題の種類</span>
            <input type="number" min="2" max="4" value={String(teamCount)}
              onInput={(e: Event) => setTeamCount(Number((e.target as HTMLInputElement).value))} />
          </div>
          <div class="row" style="margin-bottom:12px">
            <span style="min-width:96px">人数の上限</span>
            <input type="number" min="2" max="16" value={String(maxPlayers)}
              onInput={(e: Event) => setMaxPlayers(Number((e.target as HTMLInputElement).value))} />
          </div>
          <button class="primary"
            onClick={() => conn.send({ type: "configure", by: player, teamCount, maxPlayers })}>
            適用
          </button>
        </div>
      )}
    </div>
  );
};

/** 配布フェーズ。自分の語を見て確認する。全員揃うと Room が自動で質問へ進める。 */
const Assignment = ({
  view,
  player,
  conn,
}: {
  view: PlayerView;
  player: string;
  conn: Connection;
}) => {
  const [seen, setSeen] = useState(false);
  const done = view.confirmed.includes(player);
  const isPlayer = view.players.includes(player);
  return (
    <div>
      <div class="card">
        <h2>あなたのお題</h2>
        <div class="word">{seen ? (view.myWord ?? "—") : "● ● ●"}</div>
        <div class="row" style="justify-content:center">
          <button onClick={() => setSeen(!seen)}>{seen ? "隠す" : "見る"}</button>
        </div>
      </div>
      <div class="card">
        <h2>
          確認 {view.confirmed.length} / {view.players.length}
        </h2>
        {view.players.map((p) => (
          <span class={view.confirmed.includes(p) ? "chip host" : "chip"}>
            {p}
            {view.confirmed.includes(p) ? " ✓" : ""}
          </span>
        ))}
        {isPlayer && (
          <div class="row" style="margin-top:12px">
            <button
              class="primary"
              disabled={done || !seen}
              onClick={() => conn.send({ type: "confirm", player })}
            >
              {done ? "確認済み" : "確認した"}
            </button>
            {!seen && !done && <span class="muted">お題を見てください</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const MyWord = ({ word }: { word: string | null }) => {
  const [shown, setShown] = useState(false);
  return (
    <div class="card">
      <h2>あなたのお題</h2>
      <div class="word">{shown ? (word ?? "—") : "● ● ●"}</div>
      <div class="row">
        <button onClick={() => setShown(!shown)}>{shown ? "隠す" : "見る"}</button>
      </div>
    </div>
  );
};

const Playing = ({
  view,
  player,
  conn,
}: {
  view: PlayerView;
  player: string;
  conn: Connection;
}) => {
  const [text, setText] = useState("");
  const newest = view.questions[0];
  const myTurn = view.turn === player && !view.solved;
  // 正解が出た質問（あれば）。答えはまだ開いていない。
  const solvedBy = view.questions
    .flatMap((q) => q.answers.map((a) => ({ q, a })))
    .find(({ a }) => a.value === "correct");
  // 質問者以外の全員が自分の語について答える。質問者は答えない。
  const shouldAnswer =
    newest !== undefined &&
    newest.asker !== player &&
    !newest.answers.some((a) => a.player === player);

  return (
    <div>
      {solvedBy !== undefined && (
        <div class="card">
          <h2>正解</h2>
          <div class="word">{solvedBy.q.text}</div>
          <div class="muted" style="text-align:center">
            {solvedBy.q.asker} さんの質問に {solvedBy.a.player} さんが「正解」と答えました
          </div>
          <div class="row" style="margin-top:14px; justify-content:center">
            <button class="primary" onClick={() => conn.send({ type: "goto", phase: "reveal" })}>
              答え合わせへ
            </button>
          </div>
        </div>
      )}

      <div class="card">
        <h2>
          {view.solved
            ? "質問は終わりです"
            : myTurn
              ? "あなたの番です"
              : `${view.turn ?? "?"} さんの番`}
        </h2>
        <div class="row">
          <input
            type="text"
            value={text}
            placeholder="例: それは食べ物ですか?"
            disabled={!myTurn}
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
          <button
            class="primary"
            disabled={!myTurn || text.trim().length === 0}
            onClick={() => {
              conn.send({ type: "ask", asker: player, text: text.trim() });
              setText("");
            }}
          >
            聞く
          </button>
        </div>
        <div class="muted" style="margin-top:8px">
          お題そのものを言い当てたら、相手が「正解」と答えてゲームが終わります。
        </div>
      </div>

      {shouldAnswer && (
        <div class="card">
          <h2>あなたのお題について答える</h2>
          <div class="text" style="margin-bottom:10px">
            {newest.asker}: {newest.text}
          </div>
          <div class="row">
            {(["yes", "no", "partly", "unknown"] as Answer[]).map((value) => (
              <button onClick={() => conn.send({ type: "answer", player, value })}>
                {ANSWER_LABELS[value]}
              </button>
            ))}
            <span class="spacer" />
            <button
              class="primary"
              onClick={() => conn.send({ type: "answer", player, value: "correct" })}
            >
              正解
            </button>
          </div>
        </div>
      )}

      {view.questions.length > 0 && (
        <div class="card">
          <h2>これまでの質問</h2>
          {view.questions.map((q) => (
            <div class="q">
              <div class="text">
                <strong>{q.asker}</strong>: {q.text}
              </div>
              <div class="muted">
                {q.answers.length === 0
                  ? "回答待ち"
                  : q.answers
                      .map((a) => `${a.player} = ${ANSWER_LABELS[a.value]}`)
                      .join(" / ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Reveal = ({ view }: { view: PlayerView }) => (
  <div class="card">
    <h2>答え合わせ</h2>
    {(view.revealed ?? []).map((w) => (
      <div class="q">
        <span class="text" style="font-weight:700">
          {w.word}
        </span>{" "}
        — {w.player}
      </div>
    ))}
  </div>
);

const Room = ({
  code,
  player,
  settings,
  onLeave,
}: {
  code: string;
  player: string;
  settings: Settings | null;
  onLeave: () => void;
}) => {
  const { view, rejected, conn } = useRoom(code, player);
  const setup = useRef(false);

  // 接続したら自動で参加する。最初の参加者がホストになるので、
  // 部屋を建てた人の設定はホストになった直後に一度だけ送る。
  useEffect(() => {
    if (view === null || setup.current) return;
    if (view.phase === "lobby" && !view.players.includes(player)) {
      conn.send({ type: "join", player });
      return;
    }
    if (view.host === player && settings !== null) {
      conn.send({ type: "configure", by: player, ...settings });
    }
    setup.current = true;
  }, [view]);

  // 全員が確認したら質問へ進める。規則は自動遷移しないので、判断はここでする。
  // 送るのはホストだけ(全員が送っても冪等だが、無駄な往復を増やさない)。
  const advanced = useRef(false);
  useEffect(() => {
    if (view === null) return;
    if (view.phase !== "assignment") {
      advanced.current = false;
      return;
    }
    const allDone =
      view.players.length > 0 && view.players.every((p) => view.confirmed.includes(p));
    if (allDone && view.host === player && !advanced.current) {
      advanced.current = true;
      conn.send({ type: "goto", phase: "playing" });
    }
  }, [view]);

  if (view === null) return <div class="card">接続中…</div>;

  const phases = ["lobby", "assignment", "playing", "reveal"] as const;
  return (
    <div>
      <div class="row" style="margin-bottom:8px">
        <h1>ワードニンジャ</h1>
        <span class="muted">
          部屋 <code>{code}</code> / {player}
          {view.spectators.includes(player) ? "（観戦）" : ""}
        </span>
        <span class="spacer" />
        <button onClick={onLeave}>退出</button>
      </div>

      {view.phase === "lobby" && <Lobby view={view} player={player} conn={conn} />}
      {view.phase === "assignment" && (
        <Assignment view={view} player={player} conn={conn} />
      )}
      {(view.phase === "playing" || view.phase === "reveal") && (
        <MyWord word={view.myWord} />
      )}
      {view.phase === "playing" && <Playing view={view} player={player} conn={conn} />}
      {view.phase === "reveal" && <Reveal view={view} />}

      <div class="card">
        <h2>フェーズ</h2>
        <div class="row">
          {phases.map((p) => (
            <button
              class={p === view.phase ? "primary" : ""}
              onClick={() => conn.send({ type: "goto", phase: p })}
            >
              {p}
            </button>
          ))}
        </div>
        {rejected > 0 && (
          <div class="muted" style="margin-top:8px">
            拒否された操作: {rejected} 件
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [entered, setEntered] = useState<{
    code: string;
    player: string;
    settings: Settings | null;
  } | null>(null);
  return (
    <div class="wrap">
      {entered === null ? (
        <Entry onEnter={(code, player, settings) => setEntered({ code, player, settings })} />
      ) : (
        <Room
          code={entered.code}
          player={entered.player}
          settings={entered.settings}
          onLeave={() => setEntered(null)}
        />
      )}
    </div>
  );
};

render(<App />, document.getElementById("root")!);
