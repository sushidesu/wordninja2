import { z } from "zod";

// ワイヤに乗ってよいものだけをここに置く。権威状態 Room は room.ts にあり、
// この境界がそのまま可視性の保証になる(spec/ の visibility_before_reveal)。

export const phaseSchema = z.enum(["lobby", "assignment", "playing", "reveal"]);
export type Phase = z.infer<typeof phaseSchema>;

// 2値に潰さないのは、対象が本質的に複数の顔を持つ場合に
// どちらかへ倒すと語の正体を誤って伝えるため。
// correct は「質問がお題そのものだった」= ゲームの終了条件。
export const answerSchema = z.enum(["yes", "no", "partly", "unknown", "correct"]);
export type Answer = z.infer<typeof answerSchema>;

export const playerIdSchema = z.string().min(1);
export type PlayerId = z.infer<typeof playerIdSchema>;

export const questionSchema = z.object({
  asker: playerIdSchema,
  text: z.string(),
  answers: z.array(z.object({ player: playerIdSchema, value: answerSchema })),
});
export type Question = z.infer<typeof questionSchema>;

export const wordAssignmentSchema = z.object({
  player: playerIdSchema,
  word: z.string().min(1),
});
export type WordAssignment = z.infer<typeof wordAssignmentSchema>;

/** 1プレイヤーに見えるもの。サーバーが送ってよいのはこれだけ。 */
export const playerViewSchema = z.object({
  phase: phaseSchema,
  players: z.array(playerIdSchema),
  /** 語を持たず、質問も回答もしない。定員に数えない。 */
  spectators: z.array(playerIdSchema),
  /** 最初の参加者。お題の設定と部屋設定を行える唯一の人。 */
  host: playerIdSchema.nullable(),
  /** 次に質問する人。配布前は null。 */
  turn: playerIdSchema.nullable(),
  teamCount: z.int(),
  maxPlayers: z.int(),
  /** 正解が出たか(導出値)。 */
  solved: z.boolean(),
  /** 自分の語。他人の語はここに入らない。 */
  myWord: z.string().nullable(),
  questions: z.array(questionSchema),
  /** 答え合わせのときだけ割当が開く。 */
  revealed: z.array(wordAssignmentSchema).nullable(),
});
export type PlayerView = z.infer<typeof playerViewSchema>;

// できるのは質問だけ。「当てる」専用の操作は無く、質問がお題そのものだった時に
// ゲームが終わる(終了は答え合わせへの移動として記録される)。
// 質問と回答は任意で、同席プレイでは使われない。
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), player: playerIdSchema }),
  z.object({ type: z.literal("spectate"), player: playerIdSchema }),
  z.object({ type: z.literal("leave"), player: playerIdSchema }),
  z.object({
    type: z.literal("configure"),
    by: playerIdSchema,
    teamCount: z.int().min(2).max(4),
    maxPlayers: z.int().min(2).max(16),
  }),
  z.object({
    type: z.literal("deal"),
    by: playerIdSchema,
    words: z.array(wordAssignmentSchema),
    /** 最初の質問者。乱択はクライアント側(規則は純関数に保つ)。 */
    firstAsker: playerIdSchema,
  }),
  z.object({ type: z.literal("goto"), phase: phaseSchema }),
  z.object({ type: z.literal("ask"), asker: playerIdSchema, text: z.string().min(1) }),
  z.object({ type: z.literal("answer"), player: playerIdSchema, value: answerSchema }),
]);
export type Action = z.infer<typeof actionSchema>;

/** サーバーからクライアントへ。ペイロードが PlayerView に限られることが可視性の担保。 */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), view: playerViewSchema }),
  z.object({ type: z.literal("rejected") }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
