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

## Catalog and pricing workflow

The operator workbook is the pricing editing surface:

```text
../Cleaner Service Catalog.xlsx
```

The importer is retained for initial setup and workbook migrations. Day-to-day
changes happen in the authenticated Operator workspace under Services:

```text
Operator workspace → Services → edit → Save draft → Preview estimate → Publish
```

For a workbook migration or seed refresh, run the importer from `server/`:

```bash
npm run catalog:import
```

The importer repairs/enriches the workbook fields, refreshes
`server/catalog-config.json`, and seeds the SQLite catalog when no services
exist. SQLite is the runtime source for the operator catalog, public services,
and estimate calculation.

For a service that is already `Ready`, operators should change only the
explicit pricing inputs in that row: `Base Price`, `Unit Rate`, `Minimum Price`,
condition multipliers, frequency multipliers, add-on rules, or travel fee. The
`Pricing Basis`, `Change Reason`, `Pricing Version`, and `Effective Date` should
be updated with the change. Services marked `Needs operator pricing review` are
not enabled for automatic quotes.

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
| GET    | `/api/ops/services`         | operator | Working service catalog                  |
| PATCH  | `/api/ops/services/:id`     | operator | Save service edits as a draft            |
| POST   | `/api/ops/services/:id/preview` | operator | Preview a draft estimate              |
| POST   | `/api/ops/services/:id/publish` | operator | Publish service and pricing           |
| POST   | `/api/ops/services/:id/pause` | operator | Hide service from new requests          |
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

The first four pricing-ready services use the imported catalog configuration.
The remaining workbook services are cataloged but remain disabled for automatic
quotes until their pricing inputs are approved. There is no payment processing;
payments are handled offline.
