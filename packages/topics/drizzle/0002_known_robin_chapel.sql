PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_word_embeddings` (
	`word_id` integer NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`word_id`, `model`),
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_word_embeddings`("word_id", "model", "dim", "vector", "created_at") SELECT "word_id", "model", "dim", "vector", "created_at" FROM `word_embeddings`;--> statement-breakpoint
DROP TABLE `word_embeddings`;--> statement-breakpoint
ALTER TABLE `__new_word_embeddings` RENAME TO `word_embeddings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;