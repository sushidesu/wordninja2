CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  embedding BLOB
);

CREATE TABLE IF NOT EXISTS topic_sets (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS topic_set_words (
  topic_set_id TEXT NOT NULL REFERENCES topic_sets(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  PRIMARY KEY (topic_set_id, word_id)
);

CREATE TABLE IF NOT EXISTS play_records (
  id TEXT PRIMARY KEY,
  topic_set_id TEXT NOT NULL REFERENCES topic_sets(id),
  vote TEXT CHECK (vote IN ('up', 'down')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS play_record_words (
  play_record_id TEXT NOT NULL REFERENCES play_records(id),
  word_id TEXT NOT NULL REFERENCES words(id),
  PRIMARY KEY (play_record_id, word_id)
);
