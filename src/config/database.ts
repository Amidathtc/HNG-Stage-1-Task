import { Pool } from "pg";

let pool: Pool;
let dbInitialized = false;

/**
 * Get or create the PostgreSQL connection pool.
 * Reused across serverless invocations while the lambda stays warm.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5, // Keep small for serverless
    });
  }
  return pool;
}

/**
 * Initialize the database schema (runs once per cold start).
 * Creates the profiles table and unique index if they don't exist.
 */
export async function initDB(): Promise<void> {
  if (dbInitialized) return;

  const p = getPool();
  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        gender VARCHAR(50) NOT NULL,
        gender_probability DOUBLE PRECISION NOT NULL,
        sample_size INTEGER NOT NULL,
        age INTEGER NOT NULL,
        age_group VARCHAR(20) NOT NULL,
        country_id VARCHAR(10) NOT NULL,
        country_name VARCHAR(255),
        country_probability DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure backwards compatibility with older schema
    await client.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_name VARCHAR(255);
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name_lower
      ON profiles (LOWER(name));
    `);

    dbInitialized = true;
    console.log("✅ Database initialized successfully");
  } catch (err: any) {
    console.error("❌ Database initialization error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}
