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
changes happen in the authenticated Operator workspace under Services and Rate Cards:

```text
Operator workspace → Services → edit listing → Save draft
Operator workspace → Rate Cards → edit rate → Preview estimate → Publish
```

The MVP operator request flow ends at acceptance readiness and is progressive
rather than status-only:

```text
New → Qualifying → Assessment Needed → Assessment Complete → Quote Draft
→ Quote Sent → Accepted
```

Each active request carries a next action and optional due date. The operator
can record whether the request is being priced from the initial information,
customer photos/video, an on-site walkthrough, or a formal commercial survey.
Before acceptance, the operator records evidence, scope, inclusions, exclusions,
assumptions, pricing version, and customer acceptance evidence. Scheduling,
delivery, quality, completion, repeat-service, and full history features remain
documented in the Specs backlog but are shelved for this MVP.

For a workbook migration or seed refresh, run the importer from `server/`:

```bash
npm run catalog:import
```

The importer repairs/enriches the workbook fields, refreshes
`server/catalog-config.json`, and seeds the SQLite catalog when no services
exist. SQLite is the runtime source for the operator catalog, public services,
rate cards, and estimate calculation. A rate card contains the pricing method,
base price, unit rate, minimum, service area, modifiers, and version. Leave
postal codes blank for a default rate; a matching postal-code rate overrides
the default for that service.

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
| GET    | `/api/ops/rate-cards`        | operator | List service pricing rules               |
| POST   | `/api/ops/rate-cards`        | operator | Create a draft rate card                 |
| PATCH  | `/api/ops/rate-cards/:id`    | operator | Save a draft rate card                   |
| POST   | `/api/ops/rate-cards/:id/duplicate` | operator | Create a new rate version          |
| POST   | `/api/ops/rate-cards/:id/preview` | operator | Test a draft estimate                |
| POST   | `/api/ops/rate-cards/:id/publish` | operator | Publish a rate and service             |
| POST   | `/api/ops/rate-cards/:id/archive` | operator | Archive a rate version                 |
| POST   | `/api/estimate`            | –        | Illustrative estimate for partial input  |
| POST   | `/api/requests`            | –        | Submit a quote request                   |
| POST   | `/api/auth/login`          | –        | Operator sign-in (httpOnly cookie)       |
| POST   | `/api/auth/logout`         | –        | Clear session                            |
| GET    | `/api/auth/me`             | operator | Current session                          |
| GET    | `/api/requests`            | operator | Full pipeline, including contact details |
| PATCH  | `/api/requests/:reference` | operator | Advance status and save workflow context |
| GET    | `/api/requests/:reference/workflow` | operator | Customer, property, assessment, quote, job, and activity context |
| POST   | `/api/requests/:reference/assessments` | operator | Save an assessment record |
| POST   | `/api/requests/:reference/quotes` | operator | Create an immutable quote version |
| PATCH  | `/api/quotes/:id` | operator | Send, revise, accept, decline, or expire a quote |
| POST   | `/api/requests/:reference/conversations` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/follow-ups` | operator | Shelved for MVP; returns `410` |
| PATCH  | `/api/follow-ups/:id` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/schedule` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/handoff` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/variances` | operator | Shelved for MVP; returns `410` |
| PATCH  | `/api/variances/:id` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/quality` | operator | Shelved for MVP; returns `410` |
| POST   | `/api/requests/:reference/complete` | operator | Shelved for MVP; returns `410` |

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
