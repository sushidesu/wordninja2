import assert from "node:assert/strict";
import { test } from "node:test";
import type { Action, PlayerView } from "../src/contract";
import { applyAction, emptyRoom, viewFor, type Room } from "../src/room";

// spec/WordNinja/Invariants.lean で証明した性質を、実装に対して確認する。
// Lean はモデルを証明し、ここでは実装がモデルと一致することを確認する。

const run = (room: Room, actions: Action[]): Room =>
  actions.reduce<Room>((r, a) => {
    const next = applyAction(r, a);
    assert.ok(next !== null, `拒否された: ${JSON.stringify(a)}`);
    return next;
  }, room);

const WORDS = [
  { player: "a", word: "サラダ" },
  { player: "b", word: "刺身" },
];

/** a がホストの2人部屋で、配布済み。 */
const dealt = (): Room =>
  run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
    { type: "deal", by: "a", words: WORDS, firstAsker: "a" },
  ]);

const wordsVisible = (v: PlayerView): string[] => [
  ...(v.myWord === null ? [] : [v.myWord]),
  ...(v.revealed?.map((w) => w.word) ?? []),
];

test("可視性: 答え合わせ前は自分の語しか見えない", () => {
  const room = run(dealt(), [{ type: "goto", phase: "playing" }]);
  assert.deepEqual(wordsVisible(viewFor(room, "a")), ["サラダ"]);
  assert.deepEqual(wordsVisible(viewFor(room, "b")), ["刺身"]);
  assert.equal(viewFor(room, "a").revealed, null);
});

test("答え合わせ: reveal で全員の語が開く", () => {
  const room = run(dealt(), [{ type: "goto", phase: "reveal" }]);
  assert.deepEqual(viewFor(room, "a").revealed, room.words);
});

test("配布の健全性: 全員に語1つ、語の種類数がチーム数", () => {
  const room = dealt();
  assert.deepEqual(room.words.map((w) => w.player), room.players);
  assert.equal(new Set(room.words.map((w) => w.word)).size, room.teamCount);
});

test("配布の健全性: 語の種類数がチーム数と違う配布は拒否される", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
  ]);
  assert.equal(
    applyAction(room, {
      type: "deal",
      by: "a",
      firstAsker: "a",
      words: [
        { player: "a", word: "サラダ" },
        { player: "b", word: "サラダ" },
      ],
    }),
    null,
  );
});

test("ホストの決定: 最初の参加者がホストになる", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
  ]);
  assert.equal(room.host, "a");
});

test("配布の権限: ホスト以外は配れない", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
  ]);
  assert.equal(applyAction(room, { type: "deal", by: "b", words: WORDS, firstAsker: "a" }), null);
  assert.ok(applyAction(room, { type: "deal", by: "a", words: WORDS, firstAsker: "a" }) !== null);
});

test("設定の権限: ホスト以外は部屋設定を変えられない", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
  ]);
  const byOther = { type: "configure", by: "b", teamCount: 3, maxPlayers: 6 } as const;
  assert.equal(applyAction(room, byOther), null);
  const byHost = applyAction(room, { ...byOther, by: "a" });
  assert.equal(byHost?.teamCount, 3);
  assert.equal(byHost?.maxPlayers, 6);
});

test("定員: 上限を超えては参加できない", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "configure", by: "a", teamCount: 2, maxPlayers: 2 },
    { type: "join", player: "b" },
  ]);
  assert.equal(applyAction(room, { type: "join", player: "c" }), null);
});

test("順序制御: 配布前は lobby より先へ進めない", () => {
  const room = run(emptyRoom(), [{ type: "join", player: "a" }]);
  assert.equal(applyAction(room, { type: "goto", phase: "playing" }), null);
  assert.equal(applyAction(room, { type: "goto", phase: "reveal" }), null);
});

test("手番: 手番でない人は質問できない", () => {
  const room = run(dealt(), [{ type: "goto", phase: "playing" }]);
  assert.equal(room.turn, "a");
  assert.equal(applyAction(room, { type: "ask", asker: "b", text: "x" }), null);
  const asked = applyAction(room, { type: "ask", asker: "a", text: "x" });
  assert.equal(asked?.turn, "b");
});

test("手番: ラウンドロビンで一周する", () => {
  const room = run(
    run(emptyRoom(), [
      { type: "join", player: "a" },
      { type: "join", player: "b" },
      { type: "join", player: "c" },
      {
        type: "deal",
        by: "a",
        firstAsker: "b",
        words: [
          { player: "a", word: "サラダ" },
          { player: "b", word: "刺身" },
          { player: "c", word: "サラダ" },
        ],
      },
    ]),
    [{ type: "goto", phase: "playing" }],
  );
  const turns = ["b", "c", "a", "b"];
  let r = room;
  for (let i = 0; i < 3; i++) {
    assert.equal(r.turn, turns[i]);
    r = applyAction(r, { type: "ask", asker: turns[i], text: `q${i}` })!;
  }
  assert.equal(r.turn, turns[3]);
});

test("観戦者: 語を持たず、質問も回答もしない", () => {
  const room = run(dealt(), [
    { type: "spectate", player: "s" },
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは生で食べますか?" },
  ]);
  assert.deepEqual(room.spectators, ["s"]);
  assert.equal(viewFor(room, "s").myWord, null);
  assert.equal(applyAction(room, { type: "answer", player: "s", value: "yes" }), null);
  assert.equal(applyAction(room, { type: "ask", asker: "s", text: "x" }), null);
});

test("観戦者: 参加すると観戦者から外れる（二重在籍しない）", () => {
  const room = run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "spectate", player: "s" },
    { type: "join", player: "s" },
  ]);
  assert.deepEqual(room.players, ["a", "s"]);
  assert.deepEqual(room.spectators, []);
});

test("部屋設定: ロビー以外でも変えられる（建て直し不要）", () => {
  const room = run(dealt(), [{ type: "goto", phase: "playing" }]);
  const changed = applyAction(room, {
    type: "configure",
    by: "a",
    teamCount: 3,
    maxPlayers: 6,
  });
  assert.equal(changed?.maxPlayers, 6);
  assert.equal(changed?.phase, "playing");
});

test("質問者は答えない: 質問した本人の回答は拒否される", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは生で食べますか?" },
  ]);
  assert.equal(applyAction(room, { type: "answer", player: "a", value: "yes" }), null);
  const answered = applyAction(room, { type: "answer", player: "b", value: "yes" });
  assert.deepEqual(answered?.questions[0]?.answers, [{ player: "b", value: "yes" }]);
});

test("確認: 配布直後のプレイヤーだけが確認でき、フェーズは動かない", () => {
  const room = dealt();
  assert.equal(room.phase, "assignment");
  assert.equal(applyAction(room, { type: "confirm", player: "s" }), null);
  const one = applyAction(room, { type: "confirm", player: "a" })!;
  assert.deepEqual(one.confirmed, ["a"]);
  assert.equal(one.phase, "assignment");
  // 二重に確認はできない
  assert.equal(applyAction(one, { type: "confirm", player: "a" }), null);
  // 全員が確認しても規則は勝手に進めない
  const all = applyAction(one, { type: "confirm", player: "b" })!;
  assert.deepEqual(all.confirmed, ["a", "b"]);
  assert.equal(all.phase, "assignment");
});

test("確認: 配り直すと白紙に戻る", () => {
  const room = run(dealt(), [
    { type: "confirm", player: "a" },
    { type: "goto", phase: "lobby" },
    { type: "deal", by: "a", words: WORDS, firstAsker: "a" },
  ]);
  assert.deepEqual(room.confirmed, []);
});

test("ワンクッション: 正解が出ても答えは開かず、質問だけが終わる", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは刺身ですか?" },
    { type: "answer", player: "b", value: "correct" },
  ]);
  // 答えはまだ伏せたまま
  assert.equal(room.phase, "playing");
  assert.equal(viewFor(room, "a").revealed, null);
  // 質問はもうできない
  assert.equal(viewFor(room, "a").solved, true);
  assert.equal(applyAction(room, { type: "ask", asker: "b", text: "x" }), null);
  // 答え合わせは別の一歩
  const revealed = applyAction(room, { type: "goto", phase: "reveal" });
  assert.deepEqual(viewFor(revealed!, "a").revealed, room.words);
});

test("継続: 「正解」以外の回答では質問が続けられる", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは生で食べますか?" },
    { type: "answer", player: "b", value: "yes" },
  ]);
  assert.equal(viewFor(room, "a").solved, false);
  assert.ok(applyAction(room, { type: "ask", asker: "b", text: "x" }) !== null);
});

test("同席プレイの成立: 質問を記録せずに答え合わせへ到達できる", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "goto", phase: "reveal" },
  ]);
  assert.equal(room.phase, "reveal");
  assert.equal(room.questions.length, 0);
});

test("1人プレイの成立: 相手が一度も質問しないまま質問と回答が回る", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは生で食べますか?" },
    { type: "answer", player: "b", value: "yes" },
  ]);
  assert.deepEqual(room.questions.map((q) => q.asker), ["a"]);
  assert.deepEqual(room.questions.map((q) => q.answers.length), [1]);
});
