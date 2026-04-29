/**
 * scripts/seed-users.ts
 * Seeds two fixed test users into the database:
 *   - insighta-admin  (role: admin)
 *   - insighta-analyst (role: analyst)
 *
 * Run: npx ts-node scripts/seed-users.ts
 */

import { Pool } from "pg";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
});

const ADMIN_ID    = "00000000-0000-0000-0000-000000000001";
const ANALYST_ID  = "00000000-0000-0000-0000-000000000002";

async function seed() {
  const client = await pool.connect();
  try {
    // Ensure tables exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        github_id VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255),
        email VARCHAR(255),
        avatar_url VARCHAR(500),
        role VARCHAR(20) NOT NULL DEFAULT 'analyst',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Upsert admin user
    await client.query(
      `INSERT INTO users (id, github_id, username, email, avatar_url, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, 'admin', true, NOW())
       ON CONFLICT (github_id) DO UPDATE
         SET role = 'admin', is_active = true, username = EXCLUDED.username`,
      [
        ADMIN_ID,
        "test-admin-github-id",
        "insighta-admin",
        "admin@insighta.test",
        "https://avatars.githubusercontent.com/u/0",
      ]
    );
    console.log("✅ Admin user seeded  — id:", ADMIN_ID);

    // Upsert analyst user
    await client.query(
      `INSERT INTO users (id, github_id, username, email, avatar_url, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, 'analyst', true, NOW())
       ON CONFLICT (github_id) DO UPDATE
         SET role = 'analyst', is_active = true, username = EXCLUDED.username`,
      [
        ANALYST_ID,
        "test-analyst-github-id",
        "insighta-analyst",
        "analyst@insighta.test",
        "https://avatars.githubusercontent.com/u/1",
      ]
    );
    console.log("✅ Analyst user seeded — id:", ANALYST_ID);

    console.log("\nDone! Now run: npx ts-node scripts/generate-tokens.ts");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
