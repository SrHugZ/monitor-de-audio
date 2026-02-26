CREATE TABLE `channel_sends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`musicianId` int NOT NULL,
	`channelId` int NOT NULL,
	`level` float NOT NULL DEFAULT 0,
	`isMuted` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channel_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`channelType` enum('IN','STIN') NOT NULL DEFAULT 'IN',
	`channelNumber` int NOT NULL,
	`icon` varchar(64) NOT NULL DEFAULT 'music',
	`color` varchar(32) NOT NULL DEFAULT '#3b82f6',
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mix_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`musicianId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mix_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mixer_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mixer_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `mixer_config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `musicians` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`instrument` varchar(64) NOT NULL,
	`icon` varchar(64) NOT NULL DEFAULT 'music',
	`color` varchar(32) NOT NULL DEFAULT '#22c55e',
	`pin` varchar(8) NOT NULL,
	`busOut` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `musicians_id` PRIMARY KEY(`id`)
);
