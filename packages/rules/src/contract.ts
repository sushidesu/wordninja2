import { z } from "zod";

// ワイヤに乗ってよいものだけをここに置く。権威状態 Room は room.ts にあり、
// この境界がそのまま可視性の保証になる(spec/ の visibility_before_reveal)。

export const phaseSchema = z.enum(["lobby", "assignment", "playing", "reveal"]);
export type Phase = z.infer<typeof phaseSchema>;

// 2値に潰さないのは、対象が本質的に複数の顔を持つ場合に
// どちらかへ倒すと語の正体を誤って伝えるため。
export const answerSchema = z.enum(["yes", "no", "partly", "unknown"]);
export type Answer = z.infer<typeof answerSchema>;

export const playerIdSchema = z.string().min(1);
export type PlayerId = z.infer<typeof playerIdSchema>;

export const questionSchema = z.object({
  asker: playerIdSchema,
  text: z.string(),
  answers: z.array(z.object({ player: playerIdSchema, value: answerSchema })),
});
export type Question = z.infer<typeof questionSchema>;

// 推測は公開の発言。text は申告であって割当ではない。
export const guessSchema = z.object({
  guesser: playerIdSchema,
  target: playerIdSchema,
  text: z.string(),
  verdict: z.boolean().nullable(), // null は未判定
});
export type Guess = z.infer<typeof guessSchema>;

export const wordAssignmentSchema = z.object({
  player: playerIdSchema,
  word: z.string().min(1),
});
export type WordAssignment = z.infer<typeof wordAssignmentSchema>;

/** 1プレイヤーに見えるもの。サーバーが送ってよいのはこれだけ。 */
export const playerViewSchema = z.object({
  phase: phaseSchema,
  players: z.array(playerIdSchema),
  /** 自分の語。他人の語はここに入らない。 */
  myWord: z.string().nullable(),
  questions: z.array(questionSchema),
  guesses: z.array(guessSchema),
  /** 答え合わせのときだけ割当が開く。 */
  revealed: z.array(wordAssignmentSchema).nullable(),
});
export type PlayerView = z.infer<typeof playerViewSchema>;

// 質問・回答・推測・判定はすべて任意。同席プレイでは使われず、
// 1人プレイは「相手が質問してこない2人対戦」として成立する。
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), player: playerIdSchema }),
  z.object({ type: z.literal("leave"), player: playerIdSchema }),
  z.object({ type: z.literal("setTeamCount"), count: z.int().min(2).max(4) }),
  z.object({ type: z.literal("deal"), words: z.array(wordAssignmentSchema) }),
  z.object({ type: z.literal("goto"), phase: phaseSchema }),
  z.object({ type: z.literal("ask"), asker: playerIdSchema, text: z.string().min(1) }),
  z.object({ type: z.literal("answer"), player: playerIdSchema, value: answerSchema }),
  z.object({
    type: z.literal("guess"),
    guesser: playerIdSchema,
    target: playerIdSchema,
    text: z.string().min(1),
  }),
  z.object({ type: z.literal("judge"), judger: playerIdSchema, correct: z.boolean() }),
]);
export type Action = z.infer<typeof actionSchema>;

/** サーバーからクライアントへ。ペイロードが PlayerView に限られることが可視性の担保。 */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), view: playerViewSchema }),
  z.object({ type: z.literal("rejected") }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
