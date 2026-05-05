/**
 * Normalizes a query filter object into a canonical (deterministic) form.
 *
 * Two queries expressing the same intent — regardless of key order,
 * casing, or numeric type — will produce the same cache key.
 *
 * Example:
 *   { gender: "Male", country_id: "NG", min_age: "20" }
 *   { country_id: "ng", min_age: 20, gender: "male" }
 *   → same cache key
 */

export interface QueryFilters {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: string | number;
  max_age?: string | number;
  min_gender_probability?: string | number;
  min_country_probability?: string | number;
  sort_by?: string;
  order?: string;
  page?: string | number;
  limit?: string | number;
}

export function normalizeFilters(raw: Record<string, any>): QueryFilters {
  const normalized: QueryFilters = {};

  if (raw.gender && typeof raw.gender === "string") {
    normalized.gender = raw.gender.toLowerCase().trim();
  }
  if (raw.age_group && typeof raw.age_group === "string") {
    normalized.age_group = raw.age_group.toLowerCase().trim();
  }
  if (raw.country_id && typeof raw.country_id === "string") {
    normalized.country_id = raw.country_id.toUpperCase().trim();
  }
  if (raw.min_age !== undefined && !isNaN(Number(raw.min_age))) {
    normalized.min_age = Number(raw.min_age);
  }
  if (raw.max_age !== undefined && !isNaN(Number(raw.max_age))) {
    normalized.max_age = Number(raw.max_age);
  }
  if (
    raw.min_gender_probability !== undefined &&
    !isNaN(Number(raw.min_gender_probability))
  ) {
    normalized.min_gender_probability = Number(raw.min_gender_probability);
  }
  if (
    raw.min_country_probability !== undefined &&
    !isNaN(Number(raw.min_country_probability))
  ) {
    normalized.min_country_probability = Number(raw.min_country_probability);
  }

  const validSortColumns = ["age", "created_at", "gender_probability"];
  if (raw.sort_by && validSortColumns.includes(String(raw.sort_by).toLowerCase())) {
    normalized.sort_by = String(raw.sort_by).toLowerCase();
  }
  if (raw.order && ["asc", "desc"].includes(String(raw.order).toLowerCase())) {
    normalized.order = String(raw.order).toLowerCase();
  }

  normalized.page = raw.page && !isNaN(Number(raw.page)) ? Math.max(1, Number(raw.page)) : 1;
  normalized.limit =
    raw.limit && !isNaN(Number(raw.limit))
      ? Math.min(50, Math.max(1, Number(raw.limit)))
      : 10;

  return normalized;
}

/**
 * Builds a deterministic cache key from a normalized filter object.
 * Keys are sorted alphabetically so order of fields doesn't matter.
 */
export function buildCacheKey(prefix: string, filters: QueryFilters): string {
  const parts = (Object.entries(filters) as [string, any][])
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${prefix}:${parts.join(":")}`;
}
