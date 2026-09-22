import type { Action, PlayerId, PlayerView, Question, WordAssignment } from "./contract";

// spec/WordNinja/Room.lean の写し。関数の形と受理条件を Lean のモデルに一致させてある。
// 証明済みの性質は spec/WordNinja/Invariants.lean を参照。

/** 権威状態。サーバーだけが保持し、ワイヤには乗らない。 */
export type Room = {
  phase: PlayerView["phase"];
  players: PlayerId[];
  /** 語を持たず、質問も回答もしない。定員に数えない。 */
  spectators: PlayerId[];
  /** 最初の参加者。お題の設定と部屋設定を行える唯一の人。 */
  host: PlayerId | null;
  /** 次に質問する人。配布前は null。 */
  turn: PlayerId | null;
  teamCount: number;
  maxPlayers: number;
  /** 配布結果。未配布なら空。 */
  words: WordAssignment[];
  /** 自分のお題を確認し終えた人。配布のたびに空に戻る。 */
  confirmed: PlayerId[];
  /** 新しいものが先頭。 */
  questions: Question[];
};

export const emptyRoom = (): Room => ({
  phase: "lobby",
  players: [],
  spectators: [],
  host: null,
  turn: null,
  teamCount: 2,
  maxPlayers: 8,
  words: [],
  confirmed: [],
  questions: [],
});

/** players を輪と見なして cur の次の人。cur が居なければ先頭。 */
export const nextAfter = (players: PlayerId[], cur: PlayerId): PlayerId | null => {
  const i = players.indexOf(cur);
  if (players.length === 0) return null;
  return i === -1 ? players[0] : players[(i + 1) % players.length];
};

/** 正解が出たか。状態には持たず、回答の記録から導出する。 */
export const solved = (room: Room): boolean =>
  room.questions.some((q) => q.answers.some((a) => a.value === "correct"));

export const myWord = (room: Room, player: PlayerId): string | null =>
  room.words.find((w) => w.player === player)?.word ?? null;

/** 配布が健全か: 参加者全員にちょうど1つ語が付き、語の種類がちょうどチーム数。 */
export const validDeal = (
  players: PlayerId[],
  teamCount: number,
  words: WordAssignment[],
): boolean =>
  words.length === players.length &&
  words.every((w, i) => w.player === players[i]) &&
  new Set(words.map((w) => w.word)).size === teamCount;

/**
 * 可視性の射影。権威状態から1プレイヤー分の視点を切り出す唯一の経路。
 * 答え合わせ前に他人の語が混ざらないことは Lean で証明済み。
 */
export const viewFor = (room: Room, player: PlayerId): PlayerView => ({
  phase: room.phase,
  players: room.players,
  spectators: room.spectators,
  host: room.host,
  turn: room.turn,
  teamCount: room.teamCount,
  maxPlayers: room.maxPlayers,
  confirmed: room.confirmed,
  solved: solved(room),
  myWord: myWord(room, player),
  questions: room.questions,
  revealed: room.phase === "reveal" ? room.words : null,
});

/**
 * 遷移。`null` は拒否。
 * 純関数に保つため識別子や時刻を生成しない(質問は先頭が最新)。
 * 正しいクライアントは受理されない操作を提示しないので、拒否の理由は返さない。
 */
export const applyAction = (room: Room, action: Action): Room | null => {
  switch (action.type) {
    case "join":
      // 最初の参加者がホストになる。定員を超えては入れない。観戦者からの移行も兼ねる。
      if (room.phase !== "lobby") return null;
      if (room.players.includes(action.player)) return null;
      if (room.players.length >= room.maxPlayers) return null;
      return {
        ...room,
        players: [...room.players, action.player],
        spectators: room.spectators.filter((p) => p !== action.player),
        host: room.host ?? action.player,
      };

    case "spectate":
      // 観戦はいつでも。プレイヤーのまま観戦はできない(語の整合が崩れるため)。
      return !room.players.includes(action.player) &&
        !room.spectators.includes(action.player)
        ? { ...room, spectators: [...room.spectators, action.player] }
        : null;

    case "leave":
      return room.players.includes(action.player) ||
        room.spectators.includes(action.player)
        ? {
            ...room,
            players: room.players.filter((p) => p !== action.player),
            spectators: room.spectators.filter((p) => p !== action.player),
          }
        : null;

    case "configure":
      // いつでも変えられる(部屋を建て直さずに人数やルールを変えるため)。
      return room.host === action.by && room.players.length <= action.maxPlayers
        ? { ...room, teamCount: action.teamCount, maxPlayers: action.maxPlayers }
        : null;

    case "deal":
      return room.phase === "lobby" &&
        room.host === action.by &&
        room.players.includes(action.firstAsker) &&
        validDeal(room.players, room.teamCount, action.words)
        ? {
            ...room,
            phase: "assignment",
            words: action.words,
            turn: action.firstAsker,
            confirmed: [],
          }
        : null;

    case "goto":
      // lobby へ戻るときは記録を捨てる。配布前に lobby より先へは行けない。
      if (action.phase === "lobby") {
        return {
          ...room,
          phase: "lobby",
          words: [],
          questions: [],
          turn: null,
          confirmed: [],
        };
      }
      return room.words.length > 0 ? { ...room, phase: action.phase } : null;

    case "confirm":
      return room.phase === "assignment" &&
        room.players.includes(action.player) &&
        !room.confirmed.includes(action.player)
        ? { ...room, confirmed: [...room.confirmed, action.player] }
        : null;

    case "ask":
      // 手番の人だけ。正解が出たら質問は終わり。
      // 質問すると手番が次へ進む(回答は任意なので待たない)。
      return room.phase === "playing" && room.turn === action.asker && !solved(room)
        ? {
            ...room,
            questions: [
              { asker: action.asker, text: action.text, answers: [] },
              ...room.questions,
            ],
            turn: nextAfter(room.players, action.asker),
          }
        : null;

    case "answer": {
      // 質問者以外の全員が自分の語について答える。質問者自身は答えない。
      const [newest, ...rest] = room.questions;
      if (room.phase !== "playing" || newest === undefined) return null;
      if (!room.players.includes(action.player)) return null;
      if (action.player === newest.asker) return null;
      if (newest.answers.some((a) => a.player === action.player)) return null;
      // 正解もただの記録。答えを開くのは別の一歩。
      return {
        ...room,
        questions: [
          {
            ...newest,
            answers: [{ player: action.player, value: action.value }, ...newest.answers],
          },
          ...rest,
        ],
      };
    }
  }
};
