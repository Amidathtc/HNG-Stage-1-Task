import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

/**
 * Initialize the database schema.
 * Creates the profiles table and a case-insensitive unique index on name.
 */
export async function initDB(): Promise<void> {
  const client = await pool.connect();
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
        country_probability DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name_lower
      ON profiles (LOWER(name));
    `);

    console.log("✅ Database initialized successfully");
  } catch (err: any) {
    console.error("❌ Database initialization error:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

export { pool };
