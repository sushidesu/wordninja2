import assert from "node:assert/strict";
import { test } from "node:test";
import type { Action, PlayerView } from "./contract";
import { applyAction, emptyRoom, myWord, viewFor, type Room } from "./room";

// spec/WordNinja/Invariants.lean で証明した性質を、実装に対して確認する。
// Lean はモデルを証明し、ここでは実装がモデルと一致することを確認する。

const run = (room: Room, actions: Action[]): Room =>
  actions.reduce<Room>((r, a) => {
    const next = applyAction(r, a);
    assert.ok(next !== null, `拒否された: ${JSON.stringify(a)}`);
    return next;
  }, room);

const dealt = (): Room =>
  run(emptyRoom(), [
    { type: "join", player: "a" },
    { type: "join", player: "b" },
    {
      type: "deal",
      words: [
        { player: "a", word: "サラダ" },
        { player: "b", word: "刺身" },
      ],
    },
  ]);

/** 視点から読み取れる割当の語。推測の申告は割当ではないので含めない。 */
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
  assert.deepEqual(
    room.words.map((w) => w.player),
    room.players,
  );
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
      words: [
        { player: "a", word: "サラダ" },
        { player: "b", word: "サラダ" },
      ],
    }),
    null,
  );
});

test("順序制御: 配布前は lobby より先へ進めない", () => {
  const room = run(emptyRoom(), [{ type: "join", player: "a" }]);
  assert.equal(applyAction(room, { type: "goto", phase: "playing" }), null);
  assert.equal(applyAction(room, { type: "goto", phase: "reveal" }), null);
});

test("推測の対象: 自分と同じ語の相手には推測できない", () => {
  const room = run(
    run(emptyRoom(), [
      { type: "join", player: "a" },
      { type: "join", player: "b" },
      { type: "join", player: "c" },
      {
        type: "deal",
        words: [
          { player: "a", word: "サラダ" },
          { player: "b", word: "刺身" },
          { player: "c", word: "サラダ" },
        ],
      },
    ]),
    [{ type: "goto", phase: "playing" }],
  );
  // a と c は同じ語
  assert.equal(myWord(room, "a"), myWord(room, "c"));
  assert.equal(
    applyAction(room, { type: "guess", guesser: "a", target: "c", text: "サラダ" }),
    null,
  );
  assert.ok(
    applyAction(room, { type: "guess", guesser: "a", target: "b", text: "刺身" }) !== null,
  );
});

test("判定の権限: 対象と同じ語の持ち主以外は判定できない", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "guess", guesser: "a", target: "b", text: "刺身" },
  ]);
  // 推測した本人(a)は対象(b)の語を持たないので判定できない
  assert.equal(applyAction(room, { type: "judge", judger: "a", correct: true }), null);
  const judged = applyAction(room, { type: "judge", judger: "b", correct: true });
  assert.equal(judged?.guesses[0]?.verdict, true);
});

test("同席プレイの成立: 質問も推測も記録せずに答え合わせへ到達できる", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "goto", phase: "reveal" },
  ]);
  assert.equal(room.phase, "reveal");
  assert.equal(room.questions.length, 0);
  assert.equal(room.guesses.length, 0);
});

test("1人プレイの成立: 相手が一度も質問しないまま質問・回答・推測・判定が回る", () => {
  const room = run(dealt(), [
    { type: "goto", phase: "playing" },
    { type: "ask", asker: "a", text: "それは生で食べますか?" },
    { type: "answer", player: "b", value: "yes" },
    { type: "guess", guesser: "a", target: "b", text: "刺身" },
    { type: "judge", judger: "b", correct: true },
  ]);
  assert.deepEqual(
    room.questions.map((q) => q.asker),
    ["a"],
  );
  assert.deepEqual(
    room.guesses.map((g) => g.verdict),
    [true],
  );
});
