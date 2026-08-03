import {
  bigint,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().default("考生"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const questions = mysqlTable("questions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  category: mysqlEnum("category", ["leetcode", "cuda", "knowledge"]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).notNull(),
  tags: varchar("tags", { length: 500 }).notNull().default(""),
  followUps: json("follow_ups").$type<string[]>().notNull(),
  keyPoints: text("key_points").notNull().default(""),
  source: varchar("source", { length: 255 }).notNull().default(""),
  /** 同步幂等键：repo:相对路径[:条目序号]；手工题为 manual:* / seed:* */
  sourceKey: varchar("source_key", { length: 500 }).notNull().default(""),
  contentHash: varchar("content_hash", { length: 64 }).notNull().default(""),
  stale: int("stale").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const interviewSessions = mysqlTable("interview_sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  categories: json("categories").$type<string[]>().notNull(),
  questionIds: json("question_ids").$type<number[]>().notNull(),
  currentIndex: int("current_index").notNull().default(0),
  followUpIndex: int("follow_up_index").notNull().default(0),
  status: mysqlEnum("status", ["active", "finished"]).notNull().default("active"),
  overallGrade: varchar("overall_grade", { length: 8 }),
  report: text("report"),
  evaluatedBy: varchar("evaluated_by", { length: 8 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const interviewMessages = mysqlTable("interview_messages", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number" }).notNull(),
  questionId: bigint("question_id", { mode: "number" }),
  role: mysqlEnum("role", ["interviewer", "candidate", "system"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const repoSyncs = mysqlTable("repo_syncs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  repo: varchar("repo", { length: 100 }).notNull(),
  commitSha: varchar("commit_sha", { length: 64 }).notNull().default(""),
  questionCount: int("question_count").notNull().default(0),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});
