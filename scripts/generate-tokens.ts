/**
 * scripts/generate-tokens.ts
 * Generates tokens for the two seeded test users and prints them.
 * Paste the analyst token into the submission form.
 *
 * Run: npx ts-node scripts/generate-tokens.ts
 */

import { Pool } from "pg";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { randomUUID } from "crypto";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined },
});

const ADMIN_ID   = "00000000-0000-0000-0000-000000000001";
const ANALYST_ID = "00000000-0000-0000-0000-000000000002";

function makeAccessToken(user: object, expiresIn = "24h"): string {
  return jwt.sign(user, process.env.JWT_SECRET!, { expiresIn } as any);
}

function makeRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

async function storeRefreshToken(userId: string, rawToken: string): Promise<void> {
  const client = await pool.connect();
  try {
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days for grader
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
  const client = await pool.connect();
  let adminUser: any, analystUser: any;
  try {
    const adminRes  = await client.query("SELECT * FROM users WHERE id = $1", [ADMIN_ID]);
    const analystRes = await client.query("SELECT * FROM users WHERE id = $1", [ANALYST_ID]);

    if (adminRes.rows.length === 0 || analystRes.rows.length === 0) {
      console.error("❌ Seeded users not found. Run: npx ts-node scripts/seed-users.ts first.");
      process.exit(1);
    }
    adminUser   = adminRes.rows[0];
    analystUser = analystRes.rows[0];
  } finally {
    client.release();
  }

  const adminPayload = {
    id: adminUser.id,
    github_id: adminUser.github_id,
    username: adminUser.username,
    email: adminUser.email,
    avatar_url: adminUser.avatar_url,
    role: adminUser.role,
    is_active: adminUser.is_active,
  };

  const analystPayload = {
    id: analystUser.id,
    github_id: analystUser.github_id,
    username: analystUser.username,
    email: analystUser.email,
    avatar_url: analystUser.avatar_url,
    role: analystUser.role,
    is_active: analystUser.is_active,
  };

  // Generate tokens — long expiry so grader doesn't time out
  const adminAccessToken  = makeAccessToken(adminPayload,  "24h");
  const analystAccessToken = makeAccessToken(analystPayload, "24h");
  const adminRefreshToken = makeRefreshToken();

  // Store admin refresh token in DB so /auth/refresh works
  await storeRefreshToken(ADMIN_ID, adminRefreshToken);

  console.log("\n========================================");
  console.log("  INSIGHTA LABS+ — GRADER TOKENS");
  console.log("========================================\n");
  console.log("📋 PASTE THESE INTO THE SUBMISSION FORM:\n");
  console.log("Admin Test Token (leave blank if test_code works):");
  console.log(adminAccessToken);
  console.log("\nAnalyst Test Token (ALWAYS required):");
  console.log(analystAccessToken);
  console.log("\nRefresh Test Token (paired with admin token):");
  console.log(adminRefreshToken);
  console.log("\n========================================");
  console.log("✅ Admin refresh token saved to database.");
  console.log("   It expires in 30 days.\n");

  await pool.end();
}

run().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
