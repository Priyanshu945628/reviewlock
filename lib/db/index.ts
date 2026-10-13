import postgres from "postgres";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
  devDb: any;
  customDb: any;
  isPgUp: boolean | undefined;
};

function checkPostgresReachable(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return false;
  }
  if (globalForDb.isPgUp !== undefined) return globalForDb.isPgUp;
  if (process.env.NODE_ENV === "production") {
    globalForDb.isPgUp = true;
    return true;
  }
  try {
    const probeScript = `const net=require('net'); const s=net.createConnection(5432, '127.0.0.1'); s.on('connect', ()=>{s.destroy(); process.exit(0);}); s.on('error', ()=>process.exit(1)); setTimeout(()=>process.exit(1), 350);`;
    execSync(`node -e "${probeScript}"`, { stdio: "ignore" });
    globalForDb.isPgUp = true;
    return true;
  } catch {
    globalForDb.isPgUp = false;
    return false;
  }
}

function createDevInMemoryDatabase() {
  if (globalForDb.devDb) return globalForDb.devDb;

  console.log("\n================================================================================");
  console.log("[ReviewLock Dev] PostgreSQL at 127.0.0.1:5432 is not running (ECONNREFUSED).");
  console.log("[ReviewLock Dev] Activated self-contained in-memory development database (pg-mem).");
  console.log("[ReviewLock Dev] Seeded demo editor: priyanshu@example.com / Password123!");
  console.log("================================================================================\n");

  const mem = newDb();

  mem.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    returns: mem.public.getType("uuid" as any),
    implementation: () => crypto.randomUUID(),
  });

  const migrationPath = path.join(
    process.cwd(),
    "drizzle",
    "0000_clean_miss_america.sql"
  );
  if (fs.existsSync(migrationPath)) {
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      try {
        mem.public.none(statement);
      } catch (err: any) {
        if (!err.message?.includes("already exists")) {
          // ignore minor notices
        }
      }
    }
  }

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const origQuery = pool.query.bind(pool);
  pool.query = function (c: any, v: any, cb: any) {
    let isArr = false;
    if (typeof c === "object" && c) {
      if (c.rowMode === "array") isArr = true;
      delete c.rowMode;
      delete c.types;
    }
    const promise = origQuery(c, v)
      .then((res: any) => {
        if (isArr && res && res.rows) {
          res.rows = res.rows.map((r: any) =>
            Array.isArray(r) ? r : Object.values(r)
          );
        }
        if (cb) cb(null, res);
        return res;
      })
      .catch((err: any) => {
        if (cb) cb(err);
        throw err;
      });
    return typeof cb === "function" ? undefined : promise;
  };

  const memDrizzle = drizzleNodePg(pool, { schema });

  // Pre-hashed Argon2id hash for "Password123!"
  const seedPasswordHash =
    "$argon2id$v=19$m=65536,p=4,t=3$DJkYXwAtDJhm8kOzc//h8w$0hxv7zoicP+pVzp6QlhC1cl2W+SFWA0LpNtpm4oFYx8";
  const userId = "c1a02931-15cb-4eb3-bdf2-f8dcfc623910";

  try {
    mem.public.none(`
      INSERT INTO users (id, email, display_name, password_hash, storage_used_bytes)
      VALUES ('${userId}', 'priyanshu@example.com', 'Priyanshu', '${seedPasswordHash}', 0);
    `);
  } catch (err: any) {
    console.warn("[ReviewLock Dev] Seed notice:", err.message);
  }

  globalForDb.devDb = memDrizzle;
  return memDrizzle;
}

function getClient(): postgres.Sql {
  if (globalForDb.conn) return globalForDb.conn;
  const url = env.DATABASE_URL;
  const conn = postgres(
    url || "postgresql://postgres:postgres@localhost:5432/reviewlock",
    { max: 10 }
  );
  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;
  return conn;
}

export const client: postgres.Sql = checkPostgresReachable()
  ? getClient()
  : (null as any);

function getActiveDb() {
  if (globalForDb.customDb) return globalForDb.customDb;
  if (checkPostgresReachable()) {
    if (!globalForDb.conn) globalForDb.conn = getClient();
    return drizzlePg(globalForDb.conn, { schema });
  }
  return createDevInMemoryDatabase();
}

export const db: ReturnType<typeof drizzlePg<typeof schema>> = new Proxy(
  {} as any,
  {
    get(_target, prop) {
      const active = getActiveDb();
      const val = active[prop];
      if (typeof val === "function") {
        return val.bind(active);
      }
      return val;
    },
  }
) as unknown as ReturnType<typeof drizzlePg<typeof schema>>;

export function setTestDb(customDb: any): void {
  globalForDb.customDb = customDb;
}

export async function checkDbHealth(): Promise<boolean> {
  if (!checkPostgresReachable()) {
    // In dev fallback mode, in-memory DB is healthy
    return true;
  }
  try {
    if (!env.DATABASE_URL || env.DATABASE_URL.includes("placeholder")) {
      return false;
    }
    await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error("[Database] Health check failed:", error);
    return false;
  }
}
