import { Request, Response } from "express";
// import { v7 as uuidv7 } from "uuid";
import { randomUUID } from "crypto";
import { getPool } from "../config/database";
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

    // Validate: missing body or name key
    if (name === undefined || name === null) {
      res.status(400).json({
        status: "error",
        message: "Name is required",
      });
      return;
    }

    // Validate: name must be a string
    if (typeof name !== "string") {
      res.status(422).json({
        status: "error",
        message: "Name must be a string",
      });
      return;
    }

    // Validate: empty or whitespace-only name
    const trimmedName = name.trim();
    if (trimmedName === "") {
      res.status(400).json({
        status: "error",
        message: "Name cannot be empty",
      });
      return;
    }

    // Check for existing profile (case-insensitive)
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

    // Fetch from external APIs
    let externalData;
    try {
      externalData = await fetchAllExternalData(trimmedName);
    } catch (err: any) {
      // err.message is the API name: "Genderize" | "Agify" | "Nationalize"
      res.status(502).json({
        status: "error",
        message: `${err.message} returned an invalid response`,
      });
      return;
    }

    const { genderData, ageData, nationalityData } = externalData;

    // Validate Genderize response
    if (!genderData.gender || genderData.count === 0) {
      res.status(502).json({
        status: "error",
        message: "Genderize returned an invalid response",
      });
      return;
    }

    // Validate Agify response
    if (ageData.age === null || ageData.age === undefined) {
      res.status(502).json({
        status: "error",
        message: "Agify returned an invalid response",
      });
      return;
    }

    // Validate Nationalize response
    const topCountry = getTopCountry(nationalityData.country);
    if (!topCountry) {
      res.status(502).json({
        status: "error",
        message: "Nationalize returned an invalid response",
      });
      return;
    }

    // Build profile
    const id = randomUUID();
    const ageGroup = getAgeGroup(ageData.age);
    const createdAt = new Date().toISOString();
    
    const regionNamesInEnglish = new Intl.DisplayNames(['en'], { type: 'region' });
    let countryName = topCountry.country_id;
    try {
      countryName = regionNamesInEnglish.of(topCountry.country_id) || topCountry.country_id;
    } catch {
      // Fallback in case of parsing issue
    }

    // Insert into database
    const insertResult = await pool.query<ProfileRow>(
      `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        trimmedName,
        genderData.gender,
        genderData.probability,
        genderData.count,
        ageData.age,
        ageGroup,
        topCountry.country_id,
        countryName,
        topCountry.probability,
        createdAt,
      ]
    );

    res.status(201).json({
      status: "success",
      data: formatFullProfile(insertResult.rows[0]),
    });
  } catch (err: any) {
    console.error("Error creating profile:", err.message);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

// ─── GET /api/profiles/:id ──────────────────────────────────

export async function getProfileById(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const id = req.params.id as string;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        status: "error",
        message: "Invalid profile ID format",
      });
      return;
    }

    const result = await pool.query<ProfileRow>(
      "SELECT * FROM profiles WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: formatFullProfile(result.rows[0]),
    });
  } catch (err: any) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

// ─── GET /api/profiles ───────────────────────────────────────

export async function getAllProfiles(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const {
      gender,
      age_group,
      country_id,
      min_age,
      max_age,
      min_gender_probability,
      min_country_probability,
      sort_by,
      order,
      page,
      limit,
    } = req.query;

    let query = "SELECT *, COUNT(*) OVER() as total_count FROM profiles WHERE 1=1";
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Filters
    if (gender && typeof gender === "string") {
      query += ` AND LOWER(gender) = LOWER($${paramIndex})`;
      params.push(gender);
      paramIndex++;
    }

    if (age_group && typeof age_group === "string") {
      query += ` AND LOWER(age_group) = LOWER($${paramIndex})`;
      params.push(age_group);
      paramIndex++;
    }

    if (country_id && typeof country_id === "string") {
      query += ` AND LOWER(country_id) = LOWER($${paramIndex})`;
      params.push(country_id);
      paramIndex++;
    }

    if (min_age && !isNaN(Number(min_age))) {
      query += ` AND age >= $${paramIndex}`;
      params.push(Number(min_age));
      paramIndex++;
    }

    if (max_age && !isNaN(Number(max_age))) {
      query += ` AND age <= $${paramIndex}`;
      params.push(Number(max_age));
      paramIndex++;
    }

    if (min_gender_probability && !isNaN(Number(min_gender_probability))) {
      query += ` AND gender_probability >= $${paramIndex}`;
      params.push(Number(min_gender_probability));
      paramIndex++;
    }

    if (min_country_probability && !isNaN(Number(min_country_probability))) {
      query += ` AND country_probability >= $${paramIndex}`;
      params.push(Number(min_country_probability));
      paramIndex++;
    }

    // Sorting
    const validSortColumns = ["age", "created_at", "gender_probability"];
    const sortField = typeof sort_by === "string" && validSortColumns.includes(sort_by.toLowerCase()) 
      ? sort_by.toLowerCase() 
      : null;
      
    const sortOrder = typeof order === "string" && order.toLowerCase() === "desc" ? "DESC" : "ASC";

    if (sortField) {
      query += ` ORDER BY ${sortField} ${sortOrder}, id ASC`;
    } else {
      query += ` ORDER BY created_at DESC, id ASC`;
    }

    // Pagination
    const pageNum = page && !isNaN(Number(page)) ? Math.max(1, Number(page)) : 1;
    let limitNum = limit && !isNaN(Number(limit)) ? Math.max(1, Number(limit)) : 10;
    if (limitNum > 50) limitNum = 50;

    const offsetNum = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offsetNum);

    const result = await pool.query<ProfileRow & { total_count: string }>(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    // Build base query string (without page/limit) for links
    const baseParams: string[] = [];
    if (req.query.gender) baseParams.push(`gender=${req.query.gender}`);
    if (req.query.age_group) baseParams.push(`age_group=${req.query.age_group}`);
    if (req.query.country_id) baseParams.push(`country_id=${req.query.country_id}`);
    if (req.query.min_age) baseParams.push(`min_age=${req.query.min_age}`);
    if (req.query.max_age) baseParams.push(`max_age=${req.query.max_age}`);
    if (req.query.sort_by) baseParams.push(`sort_by=${req.query.sort_by}`);
    if (req.query.order) baseParams.push(`order=${req.query.order}`);
    const filterStr = baseParams.length > 0 ? `&${baseParams.join("&")}` : "";

    const basePath = req.path === "/search" ? "/api/profiles/search" : "/api/profiles";
    const selfUrl = `${basePath}?page=${pageNum}&limit=${limitNum}${filterStr}`;
    const nextUrl = pageNum < totalPages ? `${basePath}?page=${pageNum + 1}&limit=${limitNum}${filterStr}` : null;
    const prevUrl = pageNum > 1 ? `${basePath}?page=${pageNum - 1}&limit=${limitNum}${filterStr}` : null;

    res.status(200).json({
      status: "success",
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      total_pages: totalPages,
      links: {
        self: selfUrl,
        next: nextUrl,
        prev: prevUrl,
      },
      data: result.rows.map(formatClientProfile),
    });
  } catch (err: any) {
    console.error("Error fetching profiles:", err.message);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

// ─── DELETE /api/profiles/:id ────────────────────────────────

export async function deleteProfile(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool();
    const id = req.params.id as string;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      res.status(400).json({
        status: "error",
        message: "Invalid profile ID format",
      });
      return;
    }

    const result = await pool.query(
      "DELETE FROM profiles WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        status: "error",
        message: "Profile not found",
      });
      return;
    }

    res.status(204).send();
  } catch (err: any) {
    console.error("Error deleting profile:", err.message);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}
