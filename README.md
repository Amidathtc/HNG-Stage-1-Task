# Insighta Labs+ — Backend API

A secure, multi-interface Profile Intelligence System with GitHub OAuth, RBAC, and full API versioning. Built with **TypeScript**, **Express**, and **PostgreSQL**.

## System Architecture

```
┌────────────────┐   Bearer JWT     ┌──────────────────────────┐
│  insighta CLI  │ ───────────────► │                          │
└────────────────┘                  │   Backend API            │
                                    │   (Express + PostgreSQL)  │
┌────────────────┐  HTTP-only Cookie│                          │
│   Web Portal   │ ───────────────► │   /auth/*  /api/*        │
│   (Next.js)    │                  │                          │
└────────────────┘                  └──────────────────────────┘
```

Three separate repositories share **one backend**. All auth flows through GitHub OAuth. All data lives in one PostgreSQL database.

## Authentication Flow

### CLI (PKCE + Device Code Pattern)
1. `insighta login` — CLI generates `state`, `code_verifier`, `code_challenge` (SHA-256)
2. Starts a local HTTP server on port `9876`
3. Opens GitHub OAuth page in browser with PKCE params
4. GitHub redirects to `http://localhost:9876/callback`
5. CLI validates `state`, sends `code + code_verifier` to `POST /auth/github/callback?mode=cli`
6. Backend exchanges code with GitHub, creates/updates user, issues JWT pair
7. CLI stores tokens in `~/.insighta/credentials.json`

### Web Portal (Browser OAuth)
1. User clicks "Continue with GitHub" → `/api/auth/login` (Next.js route)
2. Next.js generates PKCE params, stores in HTTP-only cookies, redirects to backend
3. Backend processes callback → issues tokens → redirects back to Next.js `/api/auth/callback`
4. Next.js sets `access_token` and `refresh_token` as **HTTP-only, Secure, SameSite=Strict** cookies
5. User lands on `/dashboard`

## Token Handling

| Token | Expiry | Storage |
|---|---|---|
| Access Token | 3 minutes | CLI: `~/.insighta/credentials.json` · Web: HTTP-only cookie |
| Refresh Token | 5 minutes | CLI: `~/.insighta/credentials.json` · Web: HTTP-only cookie · DB: hashed |

- Refresh tokens are **SHA-256 hashed** before storage
- On use, the old refresh token is **immediately invalidated** (rotation)
- Tokens are never accessible via JavaScript in the web portal

## Role Enforcement Logic

| Role | Permissions |
|---|---|
| `admin` | Create profiles, delete profiles, read, search, export |
| `analyst` | Read, search, export (read-only) |

- Default role for new users: **analyst**
- Role is embedded in the JWT payload and verified on every request
- Inactive users (`is_active = false`) receive `403 Forbidden` on all requests
- Role enforcement uses structured middleware, not scattered checks

## API Endpoints

### Authentication (`/auth/*`)
```
GET  /auth/github              Redirect to GitHub OAuth
GET  /auth/github/callback     Handle OAuth callback, issue tokens
POST /auth/refresh             Rotate refresh token, issue new pair
POST /auth/logout              Invalidate refresh token
GET  /auth/whoami              Return current user (requires auth)
```

### Profiles (`/api/profiles`) — requires `X-API-Version: 1` header

```
GET    /api/profiles                  List profiles (filterable, paginated)
POST   /api/profiles                  Create profile [admin only]
GET    /api/profiles/search?q=...     Natural language search
GET    /api/profiles/export?format=csv  Export CSV
GET    /api/profiles/:id              Get single profile
DELETE /api/profiles/:id              Delete profile [admin only]
```

### Pagination Response Shape
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "total_pages": 203,
  "links": {
    "self": "/api/profiles?page=1&limit=10",
    "next": "/api/profiles?page=2&limit=10",
    "prev": null
  },
  "data": [...]
}
```

## Natural Language Parsing

The search engine uses a **rule-based regex parser** that maps plain English to filter constraints:

| Pattern | Result |
|---|---|
| `males / men / boys` | `gender=male` |
| `females / women / girls` | `gender=female` |
| `young` | `min_age=16&max_age=24` |
| `child / children` | `age_group=child` |
| `teenager / teens` | `age_group=teenager` |
| `adult / adults` | `age_group=adult` |
| `senior / seniors` | `age_group=senior` |
| `above/over N` | `min_age=N` |
| `below/under N` | `max_age=N` |
| `from/in [Country]` | `country_id=XX` (via ISO 3166-1 lookup) |

**Limitations:** No AI/ML — strict regex only. No OR queries. Typos not handled.

## CLI Usage

```bash
# Install globally
npm install -g insighta-cli

# Authentication
insighta login              # GitHub OAuth login (opens browser)
insighta logout             # Clear session
insighta whoami             # Show current user

# Profile Commands
insighta profiles list
insighta profiles list --gender male --country NG
insighta profiles list --age-group adult --min-age 25 --max-age 40
insighta profiles list --sort-by age --order desc --page 2 --limit 20
insighta profiles get <id>
insighta profiles search "young males from nigeria"
insighta profiles create --name "Harriet Tubman"  # admin only
insighta profiles export --format csv
insighta profiles export --format csv --gender male --country NG
```

## Rate Limiting

| Scope | Limit |
|---|---|
| `/auth/*` | 10 requests / minute |
| All other endpoints | 60 requests / minute per user |

Returns `429 Too Many Requests` when exceeded.

## Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL database
- GitHub OAuth App

### GitHub OAuth App Setup
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Set Homepage URL: your deployed backend URL
4. Set Authorization callback URL: `https://your-backend.com/auth/github/callback`
5. Copy Client ID and Secret into `.env`

### Installation

```bash
git clone <repo-url>
cd <repo-folder>
npm install
cp .env.example .env
# Fill in .env values
npm run build
npm start
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | `development` or `production` |
| `JWT_SECRET` | Secret for signing JWTs |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GITHUB_CALLBACK_URL` | OAuth callback URL |
| `WEB_PORTAL_URL` | Web portal URL (for redirects) |

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Framework | Express 4 |
| Database | PostgreSQL |
| Auth | GitHub OAuth + PKCE + JWT |
| Logging | Morgan |
| Rate Limiting | express-rate-limit |
| IDs | UUID v7 |

## Engineering Standards

- **Commits**: Conventional commits with scope (e.g. `feat(auth): add github oauth`)
- **Branches**: Feature branches (`feat/`, `fix/`, `chore/`)
- **PRs**: Required before merging to `main`
- **CI/CD**: GitHub Actions on every PR — lint → type-check → build
