import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { cache, } from "../config/cache";
import { normalizeFilters, buildCacheKey } from "../utils/normalize";
import { fetchAllExternalData } from "../services/externalApi";
import { getAgeGroup, getTopCountry } from "../utils/classification";

// ─── Interfaces ──────────────────────────────────────────────

interface ProfileRow {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  sample_size: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatFullProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: parseFloat(String(row.gender_probability)),
    sample_size: row.sample_size,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_name: row.country_name,
    country_probability: parseFloat(String(row.country_probability)),
    created_at: new Date(row.created_at).toISOString(),
  };
}

function formatClientProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: parseFloat(String(row.gender_probability)),
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_name: row.country_name,
    country_probability: parseFloat(String(row.country_probability)),
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ─── POST /api/profiles ──────────────────────────────────────

export async function createProfile(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const { name } = req.body;

    if (name === undefined || name === null) {
      res.status(400).json({ status: "error", message: "Name is required" });
      return;
    }

    if (typeof name !== "string") {
      res.status(422).json({ status: "error", message: "Name must be a string" });
      return;
    }

    const trimmedName = name.trim();
    if (trimmedName === "") {
      res.status(400).json({ status: "error", message: "Name cannot be empty" });
      return;
    }

    const existing = await pool.query<ProfileRow>(
      "SELECT * FROM profiles WHERE LOWER(name) = LOWER($1)",
      [trimmedName]
    );

    if (existing.rows.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Profile already exists",
        data: formatFullProfile(existing.rows[0]),
      });
      return;
    }

    let externalData;
    try {
      externalData = await fetchAllExternalData(trimmedName);
    } catch (err: any) {
      res.status(502).json({
        status: "error",
        message: `${err.message} returned an invalid response`,
      });
      return;
    }

    const { genderData, ageData, nationalityData } = externalData;

    if (!genderData.gender || genderData.count === 0) {
      res.status(502).json({ status: "error", message: "Genderize returned an invalid response" });
      return;
    }

    if (ageData.age === null || ageData.age === undefined) {
      res.status(502).json({ status: "error", message: "Agify returned an invalid response" });
      return;
    }

    const topCountry = getTopCountry(nationalityData.country);
    if (!topCountry) {
      res.status(502).json({ status: "error", message: "Nationalize returned an invalid response" });
      return;
    }

    const id = randomUUID();
    const ageGroup = getAgeGroup(ageData.age);
    const createdAt = new Date().toISOString();

    const regionNamesInEnglish = new Intl.DisplayNames(["en"], { type: "region" });
    let countryName = topCountry.country_id;
    try {
      countryName = regionNamesInEnglish.of(topCountry.country_id) || topCountry.country_id;
    } catch { /* fallback */ }

    const insertResult = await pool.query<ProfileRow>(
      `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, trimmedName, genderData.gender, genderData.probability, genderData.count, ageData.age, ageGroup, topCountry.country_id, countryName, topCountry.probability, createdAt]
    );

    // Invalidate list cache on new insert
    cache.flush();

    res.status(201).json({ status: "success", data: formatFullProfile(insertResult.rows[0]) });
  } catch (err: any) {
    console.error("Error creating profile:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

// ─── GET /api/profiles/:id ──────────────────────────────────

export async function getProfileById(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const id = req.params.id as string;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({ status: "error", message: "Invalid profile ID format" });
      return;
    }

    // Cache individual profile lookups
    const cacheKey = `profile:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.status(200).json({ status: "success", data: cached });
      return;
    }

    const result = await pool.query<ProfileRow>("SELECT * FROM profiles WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ status: "error", message: "Profile not found" });
      return;
    }

    const formatted = formatFullProfile(result.rows[0]);
    cache.set(cacheKey, formatted, 120_000); // 2 min TTL for single profile
    res.status(200).json({ status: "success", data: formatted });
  } catch (err: any) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

// ─── GET /api/profiles ───────────────────────────────────────

export async function getAllProfiles(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();

    // 1. Normalize filters into canonical form
    const filters = normalizeFilters(req.query as Record<string, any>);

    // 2. Build deterministic cache key
    const cacheKey = buildCacheKey("profiles", filters);

    // 3. Return cached result if available
    const cached = cache.get(cacheKey);
    if (cached) {
      res.status(200).json(cached);
      return;
    }

    // 4. Build and execute query
    let query = "SELECT *, COUNT(*) OVER() as total_count FROM profiles WHERE 1=1";
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.gender) {
      query += ` AND LOWER(gender) = $${paramIndex}`;
      params.push(filters.gender);
      paramIndex++;
    }
    if (filters.age_group) {
      query += ` AND LOWER(age_group) = $${paramIndex}`;
      params.push(filters.age_group);
      paramIndex++;
    }
    if (filters.country_id) {
      query += ` AND UPPER(country_id) = $${paramIndex}`;
      params.push(filters.country_id);
      paramIndex++;
    }
    if (filters.min_age !== undefined) {
      query += ` AND age >= $${paramIndex}`;
      params.push(Number(filters.min_age));
      paramIndex++;
    }
    if (filters.max_age !== undefined) {
      query += ` AND age <= $${paramIndex}`;
      params.push(Number(filters.max_age));
      paramIndex++;
    }
    if (filters.min_gender_probability !== undefined) {
      query += ` AND gender_probability >= $${paramIndex}`;
      params.push(Number(filters.min_gender_probability));
      paramIndex++;
    }
    if (filters.min_country_probability !== undefined) {
      query += ` AND country_probability >= $${paramIndex}`;
      params.push(Number(filters.min_country_probability));
      paramIndex++;
    }

    const validSortColumns = ["age", "created_at", "gender_probability"];
    const sortField = filters.sort_by && validSortColumns.includes(filters.sort_by) ? filters.sort_by : null;
    const sortOrder = filters.order === "desc" ? "DESC" : "ASC";

    if (sortField) {
      query += ` ORDER BY ${sortField} ${sortOrder}, id ASC`;
    } else {
      query += ` ORDER BY created_at DESC, id ASC`;
    }

    const pageNum = Number(filters.page) || 1;
    const limitNum = Number(filters.limit) || 10;
    const offsetNum = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query<ProfileRow & { total_count: string }>(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    // Build pagination links
    const baseParams: string[] = [];
    if (filters.gender) baseParams.push(`gender=${filters.gender}`);
    if (filters.age_group) baseParams.push(`age_group=${filters.age_group}`);
    if (filters.country_id) baseParams.push(`country_id=${filters.country_id}`);
    if (filters.min_age !== undefined) baseParams.push(`min_age=${filters.min_age}`);
    if (filters.max_age !== undefined) baseParams.push(`max_age=${filters.max_age}`);
    if (filters.sort_by) baseParams.push(`sort_by=${filters.sort_by}`);
    if (filters.order) baseParams.push(`order=${filters.order}`);
    const filterStr = baseParams.length > 0 ? `&${baseParams.join("&")}` : "";

    const basePath = req.path === "/search" ? "/api/profiles/search" : "/api/profiles";
    const selfUrl = `${basePath}?page=${pageNum}&limit=${limitNum}${filterStr}`;
    const nextUrl = pageNum < totalPages ? `${basePath}?page=${pageNum + 1}&limit=${limitNum}${filterStr}` : null;
    const prevUrl = pageNum > 1 ? `${basePath}?page=${pageNum - 1}&limit=${limitNum}${filterStr}` : null;

    const responseBody = {
      status: "success",
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      total_pages: totalPages,
      links: { self: selfUrl, next: nextUrl, prev: prevUrl },
      data: result.rows.map(formatClientProfile),
    };

    // 5. Store in cache (60s TTL)
    cache.set(cacheKey, responseBody, 60_000);

    res.status(200).json(responseBody);
  } catch (err: any) {
    console.error("Error fetching profiles:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
}

// ─── DELETE /api/profiles/:id ────────────────────────────────

export async function deleteProfile(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const id = req.params.id as string;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({ status: "error", message: "Invalid profile ID format" });
      return;
    }

    const result = await pool.query("DELETE FROM profiles WHERE id = $1 RETURNING id", [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ status: "error", message: "Profile not found" });
      return;
    }

    // Invalidate caches
    cache.delete(`profile:${id}`);
    cache.flush(); // Flush list cache since counts/pages changed

    res.status(204).send();
  } catch (err: any) {
    console.error("Error deleting profile:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
}
