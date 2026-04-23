# Profile Classification API

A RESTful API that accepts a name, fetches predictions from three external APIs (Genderize, Agify, Nationalize), applies classification logic, and persists the results in a PostgreSQL database.

Built with **TypeScript**, **Express**, and **PostgreSQL**.

## Features

- **Multi-API Integration** — Fetches gender, age, and nationality predictions in parallel
- **Classification Logic** — Categorizes age into groups (child, teenager, adult, senior)
- **Data Persistence** — Stores profiles in PostgreSQL with UUID v7 identifiers
- **Idempotency** — Duplicate names return the existing profile instead of creating a new one
- **Filtering** — Query profiles by gender, country, or age group (case-insensitive)
- **Error Handling** — Graceful handling of invalid external API responses (502) and input validation (400/422)

## Tech Stack

| Layer      | Technology         |
|------------|--------------------|
| Language   | TypeScript         |
| Framework  | Express 5          |
| Database   | PostgreSQL         |
| External   | Genderize, Agify, Nationalize APIs |
| IDs        | UUID v7            |

## API Endpoints

### Create Profile
```
POST /api/profiles
Content-Type: application/json

{ "name": "ella" }
```
**201 Created** — Returns the created profile.  
**200 OK** — If the name already exists, returns the existing profile with a message.

### Get Single Profile
```
GET /api/profiles/:id
```
**200 OK** — Returns the full profile.

### Get All Profiles
```
GET /api/profiles?gender=male&country_id=NG&age_group=adult&sort_by=age&order=desc
```
**200 OK** — Returns paginated and filtered list with total count.

**Supported Filters**:
`gender`, `age_group`, `country_id`, `min_age`, `max_age`, `min_gender_probability`, `min_country_probability`.

**Sorting and Pagination**:
`sort_by` (age, created_at, gender_probability), `order` (asc, desc). Defaults to `created_at` DESC.
`page` (default 1), `limit` (default 10, max 50).

### Natural Language Search
```
GET /api/profiles/search?q=young males from nigeria
```
**200 OK** — Parses plain English query strings to match the data exactly and supports pagination identically to standard listing algorithms.

#### Natural Language Parsing Approach
Our system uses a fast rule-based engine parsing approach containing explicit keyword and regex pattern definitions directly mapping to Database filtering constraints:
- **Age Mapping Requirements:** "young" equates to individuals aged 16 to 24 (`min_age=16`, `max_age=24`). Mentions of "child"/"teenager"/"adult"/"senior" map directly to the backend `age_group` schema. Words like "above X", "over X" or "under X", "below X" map dynamically to numeric integer limits (`min_age` or `max_age`).
- **Gender Syntax:** Variations of explicitly gendered references ("females", "women", "girls" -> `female`) apply to the `gender` column directly.
- **Location Mapping:** Phrasing such as "from [Country]" or "in [Country]" captures subsequent phrasing via Regex patterns securely mapped to their ISO Code Alpha-2 implementation via `i18n-iso-countries`.
  
#### Limitations & Edge Cases
- **Strict Rule-based:** As this mechanism utilizes rule-based RegExp algorithms, the approach does NOT handle complex AI interpretations, typos/misspellings, or ambiguous compound rules where adjectives override each other confusingly.
- **Intersection Only Limitations:** Multi-conditional strings ("males OR females") are inherently parsed into intersection logic and evaluate mutually exclusive properties into mutually inclusive filters resulting in mathematically impossible constraints returning 0 elements. We don't parse OR boolean queries effectively.
- If a query cannot be correctly deciphered due to an unrecognized country or missing mappings, it returns: `{ "status": "error", "message": "Unable to interpret query" }`.

### Delete Profile
```
DELETE /api/profiles/:id
```
**204 No Content** — Profile deleted successfully.

## Error Responses

All errors follow this structure:
```json
{
  "status": "error",
  "message": "Description of what went wrong"
}
```

| Code | Meaning |
|------|---------|
| 400  | Missing or empty name |
| 404  | Profile not found |
| 422  | Invalid type (e.g., name is not a string) |
| 502  | External API returned invalid data |
| 500  | Internal server error |

## Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL database

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd <repo-folder>

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your DATABASE_URL

# Build TypeScript
npm run build

# Start the server
npm start
```

### Environment Variables

| Variable      | Description                    | Example                                         |
|---------------|--------------------------------|-------------------------------------------------|
| `DATABASE_URL`| PostgreSQL connection string   | `postgresql://user:pass@localhost:5432/profiles` |
| `PORT`        | Server port (default: 3000)    | `3000`                                          |

### Development

```bash
npm run dev
```

## Deployment

The project includes a `Procfile` for platforms like Railway and Heroku.

**Build command:** `npm run build`  
**Start command:** `npm start`

Make sure `DATABASE_URL` is set in your deployment environment variables.
