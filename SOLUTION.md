# SOLUTION.md — Stage 4B: System Optimization & Data Ingestion

## Overview

This document covers the implementation decisions, trade-offs, and edge case handling for the three required areas: query performance, query normalization, and CSV ingestion.

---

## Part 1: Query Performance

### What was done

**In-process caching** (`src/config/cache.ts`)

A simple Map-based cache with TTL (time-to-live) was added. No external dependency — just Node.js memory.

- List queries: 60s TTL
- Single profile by ID: 120s TTL
- Cache is flushed on any write (insert, delete, ingestion)
- Max 500 entries to bound memory usage; oldest entry evicted when full

**Database indexes** (added in `src/config/database.ts`, `CREATE INDEX IF NOT EXISTS`)

| Index | Type | Covers |
|---|---|---|
| `idx_profiles_name_lower` | B-Tree (unique) | `LOWER(name)` — already existed |
| `idx_profiles_gender_country` | B-Tree (composite) | `gender, country_id` — most common filter combo |
| `idx_profiles_age` | B-Tree | `age` — range queries (above/below N) |
| `idx_profiles_age_group` | B-Tree | `age_group` — equality filters |
| `idx_profiles_created_at_brin` | BRIN | `created_at` — default sort column, batch-inserted data |

**Connection pooling** — already configured via `pg.Pool` with `max: 5` (appropriate for serverless/Vercel). No change needed here.

**Query restructuring**

- Filters are now compared against pre-normalized values (`LOWER(gender) = $1` where `$1` is already lowercased), so PostgreSQL can use the index without calling `LOWER()` on every row.
- `COUNT(*) OVER()` window function is used to get total count in a single query pass instead of two separate queries.

### Before / After comparison (estimated)

| Scenario | Before (no cache, no index) | After (cache + index) |
|---|---|---|
| Repeated `gender=male` filter | ~200–400ms (full table scan) | ~1ms (cache hit) |
| First-time filter on 1M rows | ~400–800ms | ~80–150ms (index scan) |
| Single profile by ID | ~50–100ms | ~1ms (cache hit) |
| Default list (no filters) | ~300–600ms | ~1ms (cache hit after first req) |

*Note: Exact numbers depend on Supabase network latency. Values above are representative estimates based on index behaviour at scale.*

---

## Part 2: Query Normalization

### What was done

**`src/utils/normalize.ts`** contains two functions:

1. `normalizeFilters(raw)` — converts raw query params into a canonical object:
   - All string values lowercased (gender, age_group)
   - `country_id` uppercased (ISO standard)
   - Numeric values coerced from string (`"20"` → `20`)
   - Page/limit clamped to valid ranges (1–50 for limit)
   - Invalid sort columns and orders are stripped

2. `buildCacheKey(prefix, filters)` — sorts all filter entries alphabetically and joins them into a deterministic string:
   ```
   profiles:age_group=adult:country_id=NG:gender=male:limit=10:page=1
   ```

### Why this works

`"Nigerian females 20-45"` and `"Women 20-45 in Nigeria"` both resolve to:
```json
{ "gender": "female", "country_id": "NG", "min_age": 20, "max_age": 45 }
```
After normalization and alphabetical sorting, both produce the same cache key — so the second query hits cache instantly.

### Constraints satisfied

- Fully deterministic — same input always produces same key
- No AI or LLMs — pure string/number manipulation
- Does not alter meaning — only standardizes representation

---

## Part 3: CSV Data Ingestion

### What was done

**Endpoint:** `POST /api/profiles/ingest` (admin only)

**File:** `src/controllers/ingestController.ts`

**How it works:**

1. File is received via `multipart/form-data` (field name: `file`) using `multer` with memory storage — the buffer is never written to disk.
2. The buffer is converted to a `Readable` stream and piped through `csv-parse` with `columns: true` (uses header row as keys).
3. Rows are processed one at a time via `for await` — the entire file is never loaded into memory as an array.
4. Each row is validated. Invalid rows are skipped and counted by reason.
5. Valid rows are accumulated into a batch of 500. When the batch fills, a single multi-row `INSERT ... VALUES (...),(...),...` is executed.
6. After the stream ends, any remaining rows in the partial batch are flushed.
7. A summary is returned.

### Validation rules

| Reason | Condition |
|---|---|
| `missing_fields` | `name`, `gender`, `age`, or `country_id` is empty |
| `invalid_age` | age is negative, non-integer, or > 150 |
| `invalid_gender` | gender is not `male` or `female` |
| `duplicate_name` | name already exists in DB or appeared earlier in this file |
| `malformed_row` | row can't be parsed (handled by csv-parse; parser continues) |

### Why bulk insert

Inserting 500,000 rows one-by-one would require 500,000 round-trips to a remote database. Batching into groups of 500 reduces that to ~1,000 round-trips — roughly 500× fewer network calls.

### Concurrency

- Multiple uploads can run simultaneously. Each has its own stream, batch buffer, and summary.
- The duplicate check loads existing names into a `Set` at the start of each upload. Within a single upload, newly seen names are added to the set immediately to prevent intra-file duplicates.
- `ON CONFLICT DO NOTHING` is used as a safety net in case two concurrent uploads try to insert the same name.

### Failure handling

- A single bad row never stops the upload — it is skipped with its reason recorded.
- If the stream errors mid-way (e.g. malformed encoding), rows already inserted remain committed. The response includes a `partial_summary` with counts up to the failure point.
- No rollback by design — consistent with the requirement: *"rows already inserted must remain"*.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| In-process cache (vs Redis) | Lost on restart; not shared across multiple server instances. Acceptable for single-server Vercel deployment. |
| Memory-buffered multer (vs disk) | Limits upload size to available RAM (~50MB configured). For larger files, disk storage would be needed. |
| Name Set loaded upfront | One extra DB query per upload. At 1M rows this is ~10–50ms — negligible vs the ingestion time. |
| BRIN index on created_at | Only efficient when data is inserted in roughly chronological order — which is true for batch ingestion. Random inserts would reduce its benefit. |
| Batch size of 500 | Tunable. Smaller = more round-trips, less memory. Larger = fewer round-trips, more memory per batch. 500 is a safe middle ground. |
