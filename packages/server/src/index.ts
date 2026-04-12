import { Hono } from "hono";
import type { GetRandomTopicsResponse, PostPlayedRequest } from "@wordninja/shared";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.json({ status: "ok", service: "wordninja-server" });
});

// GET /topics/random?count=N
app.get("/topics/random", async (c) => {
  const count = Number(c.req.query("count") ?? "2");
  if (count < 2) {
    return c.json({ error: "count must be at least 2" }, 400);
  }

  // ランダムにTopicSetを1つ選ぶ（wordが count 以上あるもの）
  const topicSet = await c.env.DB.prepare(`
    SELECT ts.id, COUNT(tsw.word_id) as word_count
    FROM topic_sets ts
    JOIN topic_set_words tsw ON ts.id = tsw.topic_set_id
    GROUP BY ts.id
    HAVING word_count >= ?
    ORDER BY RANDOM()
    LIMIT 1
  `)
    .bind(count)
    .first<{ id: string; word_count: number }>();

  if (!topicSet) {
    return c.json({ error: "no topic set available" }, 404);
  }

  // そのTopicSetからランダムにcount個のWordを取得
  const words = await c.env.DB.prepare(`
    SELECT w.id, w.text
    FROM words w
    JOIN topic_set_words tsw ON w.id = tsw.word_id
    WHERE tsw.topic_set_id = ?
    ORDER BY RANDOM()
    LIMIT ?
  `)
    .bind(topicSet.id, count)
    .all<{ id: string; text: string }>();

  const response: GetRandomTopicsResponse = {
    topicSetId: topicSet.id,
    topics: words.results.map((w) => ({ id: w.id, text: w.text })),
  };

  return c.json(response);
});

// POST /topics/played
app.post("/topics/played", async (c) => {
  const body = await c.req.json<PostPlayedRequest>();
  const { topicSetId, wordIds, vote } = body;

  const playRecordId = crypto.randomUUID();

  // PlayRecord を作成
  await c.env.DB.prepare(`
    INSERT INTO play_records (id, topic_set_id, vote)
    VALUES (?, ?, ?)
  `)
    .bind(playRecordId, topicSetId, vote)
    .run();

  // PlayRecord に紐づく Word を記録
  for (const wordId of wordIds) {
    await c.env.DB.prepare(`
      INSERT INTO play_record_words (play_record_id, word_id)
      VALUES (?, ?)
    `)
      .bind(playRecordId, wordId)
      .run();
  }

  return c.json({ id: playRecordId }, 201);
});

export default app;
