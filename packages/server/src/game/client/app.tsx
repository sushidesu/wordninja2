// hono/jsx/dom は、フラグメントを返すコンポーネントの後ろに兄弟要素があると、
// 再描画のたびにそのノード群を再挿入する。DOM は再挿入でフォーカスを失うため、
// 入力欄が1文字ごとにフォーカスを失っていた。単一要素を返せば起きない。
import { useEffect, useRef, useState } from "hono/jsx";
import { render } from "hono/jsx/dom";
import type { Action, Answer, PlayerView } from "@wordninja/rules";

// 型だけを借りる(実行時の zod は持ち込まない)。送る値の形はサーバー側で検証される。

const ANSWER_LABELS: Record<Answer, string> = {
  yes: "はい",
  no: "いいえ",
  partly: "部分的に",
  unknown: "わからない",
};

type Connection = { send: (action: Action) => void; close: () => void };

/** 部屋への接続。view は受け取った最新の PlayerView。 */
const useRoom = (code: string | null, player: string) => {
  const [view, setView] = useState<PlayerView | null>(null);
  const [rejected, setRejected] = useState(0);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (code === null) return;
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

  const conn: Connection = {
    send: (action) => socket.current?.send(JSON.stringify(action)),
    close: () => socket.current?.close(),
  };
  return { view, rejected, conn };
};

const Entry = ({ onEnter }: { onEnter: (code: string, player: string) => void }) => {
  const [player, setPlayer] = useState("");
  const [code, setCode] = useState("");
  const create = async () => {
    const res = await fetch("/api/game/rooms", { method: "POST" });
    const { code: newCode } = (await res.json()) as { code: string };
    onEnter(newCode, player.trim());
  };
  const ready = player.trim().length > 0;
  return (
    <div class="card">
      <h2>名前</h2>
      <div class="row">
        <input
          type="text"
          value={player}
          placeholder="あなたの名前"
          onInput={(e: Event) => setPlayer((e.target as HTMLInputElement).value)}
        />
      </div>
      <h2 style="margin-top:16px">部屋</h2>
      <div class="row">
        <input
          type="text"
          value={code}
          placeholder="部屋コード"
          onInput={(e: Event) =>
            setCode((e.target as HTMLInputElement).value.toUpperCase())
          }
        />
        <button disabled={!ready || code.length === 0} onClick={() => onEnter(code, player.trim())}>
          入る
        </button>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="primary" disabled={!ready} onClick={create}>
          新しい部屋を作る
        </button>
      </div>
    </div>
  );
};

const Lobby = ({ view, player, conn }: { view: PlayerView; player: string; conn: Connection }) => {
  const [words, setWords] = useState<Record<string, string>>({});
  const joined = view.players.includes(player);
  const filled = view.players.every((p) => (words[p] ?? "").trim().length > 0);
  const deal = () =>
    conn.send({
      type: "deal",
      words: view.players.map((p) => ({ player: p, word: words[p].trim() })),
    });
  return (
    <div>
      <div class="card">
        <h2>参加者</h2>
        {view.players.length === 0 ? (
          <div class="muted">まだ誰もいません</div>
        ) : (
          view.players.map((p) => <span class="chip">{p}</span>)
        )}
        {!joined && (
          <div class="row" style="margin-top:10px">
            <button class="primary" onClick={() => conn.send({ type: "join", player })}>
              参加する
            </button>
          </div>
        )}
      </div>
      {joined && view.players.length >= 2 && (
        <div class="card">
          <h2>お題を配る</h2>
          <div class="muted" style="margin-bottom:8px">
            同じ語を持つ人が仲間。語の種類数がチーム数(現在 {view.players.length >= 2 ? "" : ""}
            自由)と一致する必要があります。
          </div>
          {view.players.map((p) => (
            <div class="row" style="margin-bottom:6px">
              <span style="min-width:80px">{p}</span>
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
          <div class="row" style="margin-top:10px">
            <button class="primary" disabled={!filled} onClick={deal}>
              配って開始
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MyWord = ({ word }: { word: string | null }) => {
  const [shown, setShown] = useState(false);
  return (
    <div class="card">
      <h2>あなたのお題</h2>
      <div class="word">{shown ? (word ?? "—") : "• • •"}</div>
      <div class="row">
        <button onClick={() => setShown(!shown)}>{shown ? "隠す" : "見る"}</button>
      </div>
    </div>
  );
};

const Playing = ({ view, player, conn }: { view: PlayerView; player: string; conn: Connection }) => {
  const [text, setText] = useState("");
  const [guess, setGuess] = useState("");
  const [target, setTarget] = useState("");
  const newest = view.questions[0];
  const answered = newest?.answers.some((a) => a.player === player) ?? false;
  const pending = view.guesses[0]?.verdict === null ? view.guesses[0] : undefined;
  const others = view.players.filter((p) => p !== player);
  return (
    <div>
      <div class="card">
        <h2>質問する</h2>
        <div class="row">
          <input
            type="text"
            value={text}
            placeholder="例: それは食べ物ですか?"
            onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          />
          <button
            class="primary"
            disabled={text.trim().length === 0}
            onClick={() => {
              conn.send({ type: "ask", asker: player, text: text.trim() });
              setText("");
            }}
          >
            聞く
          </button>
        </div>
      </div>

      {newest !== undefined && !answered && (
        <div class="card">
          <h2>あなたのお題について答える</h2>
          <div style="margin-bottom:8px">{newest.text}</div>
          <div class="row">
            {(Object.keys(ANSWER_LABELS) as Answer[]).map((value) => (
              <button onClick={() => conn.send({ type: "answer", player, value })}>
                {ANSWER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div class="card">
        <h2>お題を当てる</h2>
        <div class="row">
          <select
            value={target}
            onChange={(e: Event) => setTarget((e.target as HTMLSelectElement).value)}
          >
            <option value="">相手を選ぶ</option>
            {others.map((p) => (
              <option value={p}>{p}</option>
            ))}
          </select>
          <input
            type="text"
            value={guess}
            placeholder="お題だと思うもの"
            onInput={(e: Event) => setGuess((e.target as HTMLInputElement).value)}
          />
          <button
            class="primary"
            disabled={target === "" || guess.trim().length === 0}
            onClick={() => {
              conn.send({ type: "guess", guesser: player, target, text: guess.trim() });
              setGuess("");
            }}
          >
            当てる
          </button>
        </div>
      </div>

      {pending !== undefined && (
        <div class="card">
          <h2>判定</h2>
          <div style="margin-bottom:8px">
            {pending.guesser} →「{pending.text}」({pending.target} のお題だと推測)
          </div>
          <div class="row">
            <button onClick={() => conn.send({ type: "judge", judger: player, correct: true })}>
              正解
            </button>
            <button onClick={() => conn.send({ type: "judge", judger: player, correct: false })}>
              不正解
            </button>
          </div>
          <div class="muted" style="margin-top:6px">
            判定できるのはそのお題の持ち主だけです
          </div>
        </div>
      )}

      {view.questions.length > 0 && (
        <div class="card">
          <h2>これまでの質問</h2>
          {view.questions.map((q) => (
            <div class="q">
              <div>
                <strong>{q.asker}</strong>: {q.text}
              </div>
              <div class="muted">
                {q.answers.length === 0
                  ? "回答待ち"
                  : q.answers.map((a) => `${a.player}=${ANSWER_LABELS[a.value]}`).join(" / ")}
              </div>
            </div>
          ))}
        </div>
      )}

      {view.guesses.length > 0 && (
        <div class="card">
          <h2>これまでの推測</h2>
          {view.guesses.map((g) => (
            <div class="q">
              {g.guesser} →「{g.text}」({g.target}){" "}
              <strong>
                {g.verdict === null ? "判定待ち" : g.verdict ? "正解" : "不正解"}
              </strong>
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
        <strong>{w.word}</strong> — {w.player}
      </div>
    ))}
  </div>
);

const Room = ({ code, player, onLeave }: { code: string; player: string; onLeave: () => void }) => {
  const { view, rejected, conn } = useRoom(code, player);
  if (view === null) return <div class="card">接続中…</div>;
  const phases = ["lobby", "assignment", "playing", "reveal"] as const;
  return (
    <div>
      <div class="row" style="margin-bottom:8px">
        <h1>ワードニンジャ</h1>
        <span class="muted">
          部屋 <code>{code}</code> / {player}
        </span>
        <span style="flex:1" />
        <button onClick={onLeave}>退出</button>
      </div>

      {view.phase === "lobby" && <Lobby view={view} player={player} conn={conn} />}
      {view.phase !== "lobby" && <MyWord word={view.myWord} />}
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
  const [entered, setEntered] = useState<{ code: string; player: string } | null>(null);
  return (
    <div class="wrap">
      {entered === null ? (
        <>
          <h1>ワードニンジャ</h1>
          <Entry onEnter={(code, player) => setEntered({ code, player })} />
        </>
      ) : (
        <Room code={entered.code} player={entered.player} onLeave={() => setEntered(null)} />
      )}
    </div>
  );
};

render(<App />, document.getElementById("root")!);
