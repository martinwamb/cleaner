# Cleaner Platform

Cleaning-business website and operator workspace: a public marketing site with a
quote-request form, and an authenticated workspace where an operator works the
inbound pipeline.

- **Live (temporary):** https://wambugumartin.com/cleaner/
- **Planned:** https://cleaner.wambugumartin.com

## Layout

```text
web/      Vite + React + TypeScript SPA (served as static files by nginx)
server/   Express + SQLite API (pm2 process behind nginx on 127.0.0.1:4003)
```

The server owns pricing, validation, and persistence. The browser never
calculates a price — the live estimate on the quote form is a debounced call to
`POST /api/estimate`, and the submitted estimate is recalculated server-side.

## Local development

```bash
# API
cd server
npm install
cp .env.example .env      # then fill in JWT_SECRET
npm run seed -- you@example.com "Your Name"
npm run dev

# Web (separate terminal) — proxies /api to 127.0.0.1:4003
cd web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Validation

```bash
cd web && npm run build
cd server && npm start
```

## API

| Method | Path                       | Auth     | Purpose                                  |
| ------ | -------------------------- | -------- | ---------------------------------------- |
| GET    | `/api/health`              | –        | Liveness probe                           |
| GET    | `/api/catalog`             | –        | Services, property types, add-ons        |
| POST   | `/api/estimate`            | –        | Illustrative estimate for partial input  |
| POST   | `/api/requests`            | –        | Submit a quote request                   |
| POST   | `/api/auth/login`          | –        | Operator sign-in (httpOnly cookie)       |
| POST   | `/api/auth/logout`         | –        | Clear session                            |
| GET    | `/api/auth/me`             | operator | Current session                          |
| GET    | `/api/requests`            | operator | Full pipeline, including contact details |
| PATCH  | `/api/requests/:reference` | operator | Advance status                           |

Public write endpoints are rate limited (10 submissions/hour/IP, 10 sign-in
attempts/15 min/IP).

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which SSHes to the
server, pulls, rebuilds `web/`, installs `server/` dependencies, and reloads the
pm2 process from `ecosystem.config.js`.

Server-side layout follows the other apps on the box:

```text
~/apps/cleaner/                     repo checkout
~/apps/cleaner/web/dist/            static files served by nginx
~/apps/cleaner/server/.env          secrets (not in git)
~/apps/cleaner/server/data.db       SQLite database (not in git)
~/apps/cleaner/.base-path           base path the current build targets
```

Required repository secrets: `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`.

## Status

Pricing values in `server/pricing.js` are illustrative placeholders — replace
them once the business validates real rates. There is no payment processing;
payments are handled offline.
