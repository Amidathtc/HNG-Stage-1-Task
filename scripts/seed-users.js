#!/usr/bin/env node
/**
 * scripts/seed-users.js
 * Plain JS version — run with: node scripts/seed-users.js
 */

// Force disable TLS verification for Supabase pooler
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();
const { Pool } = require("pg");
const { randomUUID } = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 15000,
});

const ADMIN_ID   = "00000000-0000-0000-0000-000000000001";
const ANALYST_ID = "00000000-0000-0000-0000-000000000002";

async function seed() {
  console.log("Connecting to database...");
  const client = await pool.connect();
  console.log("Connected!");

  try {
    // Ensure users table exists
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
    console.log("✅ users table ready");

    // Ensure refresh_tokens table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✅ refresh_tokens table ready");

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

    console.log("\n🎉 Seeding complete! Now run: node scripts/generate-tokens.js");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
