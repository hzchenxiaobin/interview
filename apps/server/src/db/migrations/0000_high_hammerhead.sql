CREATE TABLE `interview_messages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`session_id` bigint NOT NULL,
	`question_id` bigint,
	`role` enum('interviewer','candidate','system') NOT NULL,
	`content` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `interview_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interview_sessions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`title` varchar(255) NOT NULL,
	`categories` json NOT NULL,
	`question_ids` json NOT NULL,
	`current_index` int NOT NULL DEFAULT 0,
	`follow_up_index` int NOT NULL DEFAULT 0,
	`status` enum('active','finished') NOT NULL DEFAULT 'active',
	`overall_grade` varchar(8),
	`report` text,
	`evaluated_by` varchar(8),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`finished_at` timestamp,
	CONSTRAINT `interview_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`category` enum('leetcode','cuda','cpp','project') NOT NULL,
	`title` varchar(500) NOT NULL,
	`content` text NOT NULL,
	`difficulty` enum('easy','medium','hard') NOT NULL,
	`tags` varchar(500) NOT NULL DEFAULT '',
	`follow_ups` json NOT NULL,
	`key_points` text NOT NULL DEFAULT (''),
	`source` varchar(255) NOT NULL DEFAULT '',
	`source_key` varchar(500) NOT NULL DEFAULT '',
	`content_hash` varchar(64) NOT NULL DEFAULT '',
	`stale` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repo_syncs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`repo` varchar(100) NOT NULL,
	`commit_sha` varchar(64) NOT NULL DEFAULT '',
	`question_count` int NOT NULL DEFAULT 0,
	`synced_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repo_syncs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '考生',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
