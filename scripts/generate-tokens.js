#!/usr/bin/env node
/**
 * scripts/generate-tokens.js
 * Generates tokens for both seeded users and prints them.
 * Run with: node scripts/generate-tokens.js
 */

// Force disable TLS verification for Supabase pooler
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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

function makeAccessToken(user) {
  // 24h expiry so grader tokens don't expire during grading
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "24h" });
}

function makeRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

async function storeRefreshToken(userId, rawToken) {
  const client = await pool.connect();
  try {
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), userId, hash, expires]
    );
  } finally {
    client.release();
  }
}

async function run() {
  console.log("Connecting to database...");
  const client = await pool.connect();
  let adminUser, analystUser;

  try {
    const adminRes   = await client.query("SELECT * FROM users WHERE id = $1", [ADMIN_ID]);
    const analystRes = await client.query("SELECT * FROM users WHERE id = $1", [ANALYST_ID]);

    if (adminRes.rows.length === 0 || analystRes.rows.length === 0) {
      console.error("❌ Seeded users not found. Run: node scripts/seed-users.js first.");
      process.exit(1);
    }
    adminUser   = adminRes.rows[0];
    analystUser = analystRes.rows[0];
  } finally {
    client.release();
  }

  const adminPayload = {
    id:         adminUser.id,
    github_id:  adminUser.github_id,
    username:   adminUser.username,
    email:      adminUser.email,
    avatar_url: adminUser.avatar_url,
    role:       adminUser.role,
    is_active:  adminUser.is_active,
  };
  const analystPayload = {
    id:         analystUser.id,
    github_id:  analystUser.github_id,
    username:   analystUser.username,
    email:      analystUser.email,
    avatar_url: analystUser.avatar_url,
    role:       analystUser.role,
    is_active:  analystUser.is_active,
  };

  const adminAccessToken   = makeAccessToken(adminPayload);
  const analystAccessToken = makeAccessToken(analystPayload);
  const adminRefreshToken  = makeRefreshToken();

  // Store admin refresh token in DB so /auth/refresh works
  await storeRefreshToken(ADMIN_ID, adminRefreshToken);

  console.log("\n========================================");
  console.log("  INSIGHTA LABS+ — GRADER TOKENS");
  console.log("========================================\n");
  console.log("📋 PASTE THESE INTO THE SUBMISSION FORM:\n");
  console.log("── Admin Test Token (leave blank if test_code works) ──");
  console.log(adminAccessToken);
  console.log("\n── Analyst Test Token (ALWAYS required) ──");
  console.log(analystAccessToken);
  console.log("\n── Refresh Test Token (paired with admin token) ──");
  console.log(adminRefreshToken);
  console.log("\n========================================");
  console.log("✅ Admin refresh token saved to DB (expires 30 days).\n");

  await pool.end();
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
