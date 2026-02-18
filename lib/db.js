import { Pool } from "pg";

const rawDatabaseUrl = process.env.DATABASE_URL || "";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const forceSupabase =
  process.env.USE_SUPABASE_REST === "true" ||
  process.env.NEXT_PUBLIC_USE_SUPABASE_REST === "true" ||
  isBuildPhase;
const isPostgresUrl = /^postgres(ql)?:\/\//i.test(rawDatabaseUrl);
const hasDatabase = isPostgresUrl && !forceSupabase;

if (!hasDatabase) {
  const message = rawDatabaseUrl
    ? forceSupabase
      ? "USE_SUPABASE_REST is enabled. Skipping Postgres and using Supabase REST if configured."
      : "DATABASE_URL is not a Postgres URI. Falling back to Supabase REST if configured."
    : "DATABASE_URL is not set. UI will render empty data until it is configured.";
  console.warn(message);
}

const globalForPg = globalThis;

const pool = hasDatabase
  ? globalForPg.pgPool ||
    new Pool({
      connectionString: process.env.DATABASE_URL
    })
  : null;

if (hasDatabase && process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export const query = (text, params) => {
  if (!pool) {
    return Promise.resolve({ rows: [] });
  }
  return pool.query(text, params);
};

export { hasDatabase };
