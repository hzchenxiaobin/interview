-- cpp / project 方向合并为 knowledge（专业知识）
-- 1) 先放宽枚举，避免直接窄化时存量 cpp/project 数据报错或被截断为空串
ALTER TABLE `questions` MODIFY COLUMN `category` enum('leetcode','cuda','cpp','project','knowledge') NOT NULL;--> statement-breakpoint
-- 2) 存量题目归类到 knowledge
UPDATE `questions` SET `category` = 'knowledge' WHERE `category` IN ('cpp', 'project');--> statement-breakpoint
-- 3) 窄化枚举到最终取值
ALTER TABLE `questions` MODIFY COLUMN `category` enum('leetcode','cuda','knowledge') NOT NULL;--> statement-breakpoint
-- 4) 历史场次的 categories（JSON 数组）同步改写并去重
UPDATE `interview_sessions` s
SET s.`categories` = (
  SELECT JSON_ARRAYAGG(x.c) FROM (
    SELECT DISTINCT CASE WHEN jt.c IN ('cpp', 'project') THEN 'knowledge' ELSE jt.c END AS c
    FROM JSON_TABLE(s.`categories`, '$[*]' COLUMNS (c VARCHAR(50) PATH '$')) jt
  ) x
);
