import { Request, Response } from "express";
import { Readable } from "stream";
import { parse } from "csv-parse";
import { randomUUID } from "crypto";
import { getPool } from "../config/database";
import { getAgeGroup } from "../utils/classification";
import { cache } from "../config/cache";

const VALID_GENDERS = ["male", "female"];
const BATCH_SIZE = 500; // insert 500 rows per DB round-trip

interface CsvRow {
  name: string;
  gender: string;
  gender_probability: string;
  sample_size: string;
  age: string;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: string;
}

interface IngestSummary {
  total_rows: number;
  inserted: number;
  skipped: number;
  reasons: {
    duplicate_name: number;
    invalid_age: number;
    invalid_gender: number;
    missing_fields: number;
    malformed_row: number;
  };
}

function validateRow(row: any): { valid: boolean; reason?: keyof IngestSummary["reasons"] } {
  // Check required fields exist
  const required = ["name", "gender", "age", "country_id"];
  for (const field of required) {
    if (!row[field] || String(row[field]).trim() === "") {
      return { valid: false, reason: "missing_fields" };
    }
  }

  // Validate age
  const age = Number(row.age);
  if (isNaN(age) || age < 0 || age > 150 || !Number.isInteger(age)) {
    return { valid: false, reason: "invalid_age" };
  }

  // Validate gender
  if (!VALID_GENDERS.includes(String(row.gender).toLowerCase().trim())) {
    return { valid: false, reason: "invalid_gender" };
  }

  return { valid: true };
}

// ─── POST /api/profiles/ingest ───────────────────────────────

export async function ingestCSV(req: Request, res: Response): Promise<void> {
  const pool = getPool();

  // multer attaches the file to req.file
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ status: "error", message: "No CSV file uploaded. Use multipart/form-data with field name 'file'." });
    return;
  }

  const summary: IngestSummary = {
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {
      duplicate_name: 0,
      invalid_age: 0,
      invalid_gender: 0,
      missing_fields: 0,
      malformed_row: 0,
    },
  };

  // Collect existing lowercase names for fast duplicate detection
  // We fetch them once upfront to avoid a DB query per row
  const existingNamesResult = await pool.query<{ name: string }>(
    "SELECT LOWER(name) as name FROM profiles"
  );
  const existingNames = new Set<string>(existingNamesResult.rows.map((r) => r.name));

  // Track names we've already seen in this upload (to avoid duplicates within the file)
  const seenInBatch = new Set<string>();

  let batch: any[][] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;

    // Build a single multi-row INSERT
    // VALUES ($1,$2,...), ($N+1,$N+2,...), ...
    const values: any[] = [];
    const placeholders: string[] = [];
    const cols = 11; // number of columns per row

    batch.forEach((row, i) => {
      const offset = i * cols;
      placeholders.push(
        `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`
      );
      values.push(...row);
    });

    const sql = `
      INSERT INTO profiles
        (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_name, country_probability, created_at)
      VALUES ${placeholders.join(",")}
      ON CONFLICT DO NOTHING
    `;

    await pool.query(sql, values);
    batch = [];
  };

  try {
    // Stream the file buffer through the CSV parser
    const readable = Readable.from(file.buffer);
    const parser = readable.pipe(
      parse({
        columns: true,          // use first row as header
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // don't throw on wrong column count — we validate ourselves
        bom: true,
      })
    );

    for await (const rawRow of parser) {
      summary.total_rows++;

      // Validate the row
      const validation = validateRow(rawRow);
      if (!validation.valid) {
        summary.skipped++;
        summary.reasons[validation.reason!]++;
        continue;
      }

      const name = String(rawRow.name).trim();
      const nameLower = name.toLowerCase();

      // Check for duplicate (DB or within this file)
      if (existingNames.has(nameLower) || seenInBatch.has(nameLower)) {
        summary.skipped++;
        summary.reasons.duplicate_name++;
        continue;
      }

      seenInBatch.add(nameLower);
      existingNames.add(nameLower); // optimistically mark as taken

      const age = Math.round(Number(rawRow.age));
      const gender = String(rawRow.gender).toLowerCase().trim();
      const genderProbability = !isNaN(Number(rawRow.gender_probability))
        ? Math.min(1, Math.max(0, Number(rawRow.gender_probability)))
        : 0.5;
      const sampleSize = !isNaN(Number(rawRow.sample_size)) ? Math.round(Number(rawRow.sample_size)) : 0;
      const countryId = String(rawRow.country_id).toUpperCase().trim();
      const countryName = rawRow.country_name ? String(rawRow.country_name).trim() : countryId;
      const countryProbability = !isNaN(Number(rawRow.country_probability))
        ? Math.min(1, Math.max(0, Number(rawRow.country_probability)))
        : 0.5;
      const ageGroup = rawRow.age_group && String(rawRow.age_group).trim() !== ""
        ? String(rawRow.age_group).trim().toLowerCase()
        : getAgeGroup(age);

      batch.push([
        randomUUID(),
        name,
        gender,
        genderProbability,
        sampleSize,
        age,
        ageGroup,
        countryId,
        countryName,
        countryProbability,
        new Date().toISOString(),
      ]);

      summary.inserted++;

      // Flush batch when it reaches BATCH_SIZE
      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    // Flush any remaining rows
    await flushBatch();

    // Invalidate query cache since new data was inserted
    cache.flush();

    res.status(200).json({
      status: "success",
      total_rows: summary.total_rows,
      inserted: summary.inserted,
      skipped: summary.skipped,
      reasons: summary.reasons,
    });
  } catch (err: any) {
    // Even if we error mid-stream, already-inserted rows remain (no rollback by design)
    console.error("CSV ingestion error:", err.message);
    res.status(500).json({
      status: "error",
      message: "Ingestion failed mid-stream. Rows processed so far have been committed.",
      partial_summary: summary,
    });
  }
}
