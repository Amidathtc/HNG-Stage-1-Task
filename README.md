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
GET /api/profiles?gender=male&country_id=NG&age_group=adult
```
**200 OK** — Returns filtered list with count. All query parameters are optional and case-insensitive.

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
