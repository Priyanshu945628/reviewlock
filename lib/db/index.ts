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
  const proj1Id = "11111111-1111-1111-1111-111111111111";
  const proj2Id = "22222222-2222-2222-2222-222222222222";
  const proj3Id = "33333333-3333-3333-3333-333333333333";

  try {
    mem.public.none(`
      INSERT INTO users (id, email, display_name, password_hash, storage_used_bytes)
      VALUES ('${userId}', 'priyanshu@example.com', 'Priyanshu', '${seedPasswordHash}', 8600000000);

      INSERT INTO projects (id, user_id, title, original_filename, original_size, duration_seconds, width, height, status, drive_file_id, drive_md5)
      VALUES 
        ('${proj1Id}', '${userId}', 'Wedding_Reel_v3.mp4', 'Wedding_Reel_v3.mp4', 2900000000, 252, 1920, 1080, 'ready', 'drive_seed_wedding_reel_v3', 'd41d8cd98f00b204e9800998ecf8427e'),
        ('${proj2Id}', '${userId}', 'Brand_Promo_Final.mov', 'Brand_Promo_Final.mov', 1200000000, 108, 1920, 1080, 'ready', 'drive_seed_brand_promo_final', '0cc175b9c0f1b6a831c399e269772661'),
        ('${proj3Id}', '${userId}', 'Podcast_Ep14_Cut.mp4', 'Podcast_Ep14_Cut.mp4', 4500000000, 2285, 1920, 1080, 'ready', 'drive_seed_podcast_ep14_cut', '92eb5ffee6ae2fec3ad71c777531578f');

      INSERT INTO share_links (id, project_id, slug, client_label, visibility, preview_mode, preview_start, preview_end, max_viewers, viewers_used, watermark_text, status)
      VALUES
        ('44444444-4444-4444-4444-444444444444', '${proj1Id}', 'wedding-reel-preview', 'Rahul – Wedding Reel', 'public', 'first_n_seconds', 0, 30, 2, 1, 'PREVIEW · NOT PAID', 'active'),
        ('55555555-5555-5555-5555-555555555555', '${proj2Id}', 'brand-promo-preview', 'Studio Kala – Brand Cut', 'public', 'custom_segment', 10, 40, 5, 2, 'PREVIEW · NOT PAID', 'unlocked');
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
