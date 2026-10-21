CREATE TABLE `messages` (
	`prospect_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`prospect_id`, `seq`),
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prospects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`owner_email` text NOT NULL,
	`theme` text NOT NULL,
	`password_hash` text NOT NULL,
	`gate_version` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "slug_not_reserved" CHECK("prospects"."slug" <> 'bug-survivors-default')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_slug_unique` ON `prospects` (`slug`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board` text NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`stats` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scores_board` ON `scores` (`board`,"score" desc,`at`);--> statement-breakpoint
CREATE TABLE `sprites` (
	`prospect_id` integer NOT NULL,
	`slot` text NOT NULL,
	`grid` text NOT NULL,
	PRIMARY KEY(`prospect_id`, `slot`),
	FOREIGN KEY (`prospect_id`) REFERENCES `prospects`(`id`) ON UPDATE no action ON DELETE cascade
);
