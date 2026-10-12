import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

function getClient(): postgres.Sql {
  if (globalForDb.conn) return globalForDb.conn;
  const url = env.DATABASE_URL;
  if (!url || url.includes("placeholder")) {
    return postgres("postgresql://postgres:postgres@localhost:5432/reviewlock", {
      max: 1,
    });
  }
  const conn = postgres(url, { max: 10 });
  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;
  return conn;
}

export const client = getClient();
export let db = drizzle(client, { schema });

export function setTestDb(customDb: any): void {
  db = customDb;
}

export async function checkDbHealth(): Promise<boolean> {
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
