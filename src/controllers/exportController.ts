import { Request, Response } from "express";
import { getPool } from "../config/database";

interface ProfileRow {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: string;
}

function escapeCsv(value: any): string {
  const str = String(value ?? "");
  // Wrap in quotes if it contains comma, newline, or double quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── GET /api/profiles/export?format=csv ─────────────────────

export async function exportProfilesCSV(
  req: Request,
  res: Response
): Promise<void> {
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
    } = req.query;

    let query = "SELECT * FROM profiles WHERE 1=1";
    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Filters (same as getAllProfiles)
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
    const sortField =
      typeof sort_by === "string" && validSortColumns.includes(sort_by.toLowerCase())
        ? sort_by.toLowerCase()
        : null;
    const sortOrder =
      typeof order === "string" && order.toLowerCase() === "desc" ? "DESC" : "ASC";

    if (sortField) {
      query += ` ORDER BY ${sortField} ${sortOrder}, id ASC`;
    } else {
      query += ` ORDER BY created_at DESC, id ASC`;
    }

    const result = await pool.query<ProfileRow>(query, params);

    // Build CSV
    const columns = [
      "id",
      "name",
      "gender",
      "gender_probability",
      "age",
      "age_group",
      "country_id",
      "country_name",
      "country_probability",
      "created_at",
    ];

    const header = columns.join(",");
    const rows = result.rows.map((row) => {
      return [
        escapeCsv(row.id),
        escapeCsv(row.name),
        escapeCsv(row.gender),
        escapeCsv(parseFloat(String(row.gender_probability))),
        escapeCsv(row.age),
        escapeCsv(row.age_group),
        escapeCsv(row.country_id),
        escapeCsv(row.country_name),
        escapeCsv(parseFloat(String(row.country_probability))),
        escapeCsv(new Date(row.created_at).toISOString()),
      ].join(",");
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const csv = [header, ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="profiles_${timestamp}.csv"`
    );
    res.status(200).send(csv);
  } catch (err: any) {
    console.error("Export error:", err.message);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
}
