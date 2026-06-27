CREATE TABLE `topic_set_evaluations` (
	`topic_set_id` text NOT NULL,
	`source` text NOT NULL,
	`score` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`topic_set_id`, `source`),
	FOREIGN KEY (`topic_set_id`) REFERENCES `topic_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word_embeddings` (
	`word_id` integer NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` blob NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`word_id`, `model`),
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_set_id` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`topic_set_id`) REFERENCES `topic_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
