import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../env.js";
import * as schema from "./schema.js";

const pool = mysql.createPool(env.DATABASE_URL);

export const db = drizzle(pool, { schema, mode: "default" });
export type Db = typeof db;
