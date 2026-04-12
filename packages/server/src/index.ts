import { Hono } from "hono";
import type {
  GetRandomTopicsResponse,
  PostPlayedRequest,
  TopicSetWithStats,
  CreateTopicSetRequest,
} from "@wordninja/shared";

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

// ---- Admin API ----

// GET /admin/api/topic-sets
app.get("/admin/api/topic-sets", async (c) => {
  // 全TopicSetを取得
  const topicSets = await c.env.DB.prepare(`
    SELECT ts.id
    FROM topic_sets ts
    ORDER BY ts.id
  `).all<{ id: string }>();

  const results: TopicSetWithStats[] = [];

  for (const ts of topicSets.results) {
    // TopicSetに属するWordを取得
    const words = await c.env.DB.prepare(`
      SELECT w.id, w.text
      FROM words w
      JOIN topic_set_words tsw ON w.id = tsw.word_id
      WHERE tsw.topic_set_id = ?
      ORDER BY w.text
    `)
      .bind(ts.id)
      .all<{ id: string; text: string }>();

    // PlayRecordから集計
    const stats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as play_count,
        SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) as downvotes
      FROM play_records
      WHERE topic_set_id = ?
    `)
      .bind(ts.id)
      .first<{ play_count: number; upvotes: number; downvotes: number }>();

    results.push({
      id: ts.id,
      words: words.results.map((w) => ({ id: w.id, text: w.text })),
      playCount: stats?.play_count ?? 0,
      upvotes: stats?.upvotes ?? 0,
      downvotes: stats?.downvotes ?? 0,
    });
  }

  return c.json(results);
});

// POST /admin/api/topic-sets
app.post("/admin/api/topic-sets", async (c) => {
  const body = await c.req.json<CreateTopicSetRequest>();
  const { words: wordTexts } = body;

  if (wordTexts.length < 2) {
    return c.json({ error: "at least 2 words required" }, 400);
  }

  const topicSetId = crypto.randomUUID();
  const wordIds: string[] = [];

  // 各Wordについて、既存があればそのid、なければ新規作成
  for (const text of wordTexts) {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM words WHERE text = ?",
    )
      .bind(text)
      .first<{ id: string }>();

    if (existing) {
      wordIds.push(existing.id);
    } else {
      const wordId = crypto.randomUUID();
      await c.env.DB.prepare("INSERT INTO words (id, text) VALUES (?, ?)")
        .bind(wordId, text)
        .run();
      wordIds.push(wordId);
    }
  }

  // TopicSet作成
  await c.env.DB.prepare("INSERT INTO topic_sets (id) VALUES (?)")
    .bind(topicSetId)
    .run();

  // TopicSet - Word 紐付け
  for (const wordId of wordIds) {
    await c.env.DB.prepare(
      "INSERT INTO topic_set_words (topic_set_id, word_id) VALUES (?, ?)",
    )
      .bind(topicSetId, wordId)
      .run();
  }

  return c.json({ id: topicSetId }, 201);
});

// DELETE /admin/api/topic-sets/:id
app.delete("/admin/api/topic-sets/:id", async (c) => {
  const id = c.req.param("id");

  // 紐付け削除 → TopicSet削除
  await c.env.DB.prepare(
    "DELETE FROM topic_set_words WHERE topic_set_id = ?",
  )
    .bind(id)
    .run();
  await c.env.DB.prepare("DELETE FROM topic_sets WHERE id = ?").bind(id).run();

  return c.json({ ok: true });
});

// POST /admin/api/generate (スタブ - 後でLLM連携)
app.post("/admin/api/generate", async (c) => {
  // TODO: LLMで候補生成
  return c.json({
    candidates: [
      ["電車", "バス", "タクシー", "自転車"],
      ["醤油", "味噌", "塩", "酢"],
      ["富士山", "エベレスト", "キリマンジャロ"],
    ],
  });
});

export default app;
