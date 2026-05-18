import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function missingDatabaseUrlError() {
  return new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function createUnavailablePool(): pg.Pool {
  return {
    query: () => Promise.reject(missingDatabaseUrlError()),
    connect: () => Promise.reject(missingDatabaseUrlError()),
    end: () => Promise.resolve(),
  } as unknown as pg.Pool;
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : createUnavailablePool();
export const db = drizzle(pool, { schema });

export * from "./schema";
