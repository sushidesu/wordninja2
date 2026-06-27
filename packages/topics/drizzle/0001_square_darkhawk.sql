CREATE TABLE `topic_set_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`words` text NOT NULL,
	`source` text,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
