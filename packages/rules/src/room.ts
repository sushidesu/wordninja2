import type {
  Action,
  Guess,
  PlayerId,
  PlayerView,
  Question,
  WordAssignment,
} from "./contract";

// spec/WordNinja/Room.lean の写し。関数の形と受理条件を Lean のモデルに一致させてある。
// 証明済みの性質は spec/WordNinja/Invariants.lean を参照。

/** 権威状態。サーバーだけが保持し、ワイヤには乗らない。 */
export type Room = {
  phase: PlayerView["phase"];
  players: PlayerId[];
  teamCount: number;
  /** 配布結果。未配布なら空。 */
  words: WordAssignment[];
  /** 新しいものが先頭。 */
  questions: Question[];
  /** 新しいものが先頭。 */
  guesses: Guess[];
};

export const emptyRoom = (): Room => ({
  phase: "lobby",
  players: [],
  teamCount: 2,
  words: [],
  questions: [],
  guesses: [],
});

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
  myWord: myWord(room, player),
  questions: room.questions,
  guesses: room.guesses,
  revealed: room.phase === "reveal" ? room.words : null,
});

/**
 * 遷移。`null` は拒否。
 * 純関数に保つため識別子や時刻を生成しない(質問・推測は先頭が最新)。
 * 正しいクライアントは受理されない操作を提示しないので、拒否の理由は返さない。
 */
export const applyAction = (room: Room, action: Action): Room | null => {
  switch (action.type) {
    case "join":
      return room.phase === "lobby" && !room.players.includes(action.player)
        ? { ...room, players: [...room.players, action.player] }
        : null;

    case "leave":
      return room.players.includes(action.player)
        ? { ...room, players: room.players.filter((p) => p !== action.player) }
        : null;

    case "setTeamCount":
      return room.phase === "lobby" ? { ...room, teamCount: action.count } : null;

    case "deal":
      return room.phase === "lobby" &&
        validDeal(room.players, room.teamCount, action.words)
        ? { ...room, phase: "assignment", words: action.words }
        : null;

    case "goto":
      // lobby へ戻るときは記録を捨てる。配布前に lobby より先へは行けない。
      if (action.phase === "lobby") {
        return { ...room, phase: "lobby", words: [], questions: [], guesses: [] };
      }
      return room.words.length > 0 ? { ...room, phase: action.phase } : null;

    case "ask":
      return room.phase === "playing" && room.players.includes(action.asker)
        ? {
            ...room,
            questions: [
              { asker: action.asker, text: action.text, answers: [] },
              ...room.questions,
            ],
          }
        : null;

    case "answer": {
      const [newest, ...rest] = room.questions;
      if (room.phase !== "playing" || newest === undefined) return null;
      if (!room.players.includes(action.player)) return null;
      if (newest.answers.some((a) => a.player === action.player)) return null;
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

    case "guess": {
      // 自分と同じ語の相手には推測しない(当てる対象が自分の語になってしまう)。
      const mine = myWord(room, action.guesser);
      const theirs = myWord(room, action.target);
      if (room.phase !== "playing") return null;
      if (!room.players.includes(action.guesser)) return null;
      if (!room.players.includes(action.target)) return null;
      if (mine === null || theirs === null || mine === theirs) return null;
      return {
        ...room,
        guesses: [
          {
            guesser: action.guesser,
            target: action.target,
            text: action.text,
            verdict: null,
          },
          ...room.guesses,
        ],
      };
    }

    case "judge": {
      // 判定できるのは語の持ち主だけ。
      const [newest, ...rest] = room.guesses;
      if (room.phase !== "playing" || newest === undefined) return null;
      if (newest.verdict !== null) return null;
      const judgerWord = myWord(room, action.judger);
      if (judgerWord === null || judgerWord !== myWord(room, newest.target)) return null;
      return {
        ...room,
        guesses: [{ ...newest, verdict: action.correct }, ...rest],
      };
    }
  }
};
