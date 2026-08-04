# Gahezlak

QR-code menus and ordering for restaurants. A shop owner signs up, builds a menu, and gets a QR code; customers scan it, order from their phone, and pay by card or mobile wallet — or in person. Shop owners manage orders, staff and analytics from a dashboard, and the platform itself runs on paid subscription plans.

Bilingual throughout (English / Arabic, with RTL support).

## Repository layout

A monorepo of two **independent** npm packages. There is no workspace root — each has its own `node_modules`, its own lockfile, and is built and deployed on its own.

```
backend/     Express + TypeScript REST API (MongoDB via Mongoose)
frontend/    React + TypeScript SPA (Vite), served in production by its own Express server
render.yaml  Deployment blueprint for both services
```

The repo root holds only shared tooling: Prettier, husky/lint-staged, and the CI workflow.

## Stack

**Backend** — Express 5, TypeScript, Mongoose 8, JWT auth with bcrypt, Pino logging, Zod/express-validator input validation, Sentry error monitoring. Paymob for payments and subscriptions. Claude (`@anthropic-ai/sdk`) for optional AI menu features. Vitest + supertest + `mongodb-memory-server` for tests.

**Frontend** — React 19, TypeScript, Vite, TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui, i18next, Recharts, Sentry. Vitest + React Testing Library.

Node **22.x** on both sides (see `.nvmrc`).

## Getting started

You need Node 22, and a MongoDB connection string (local `mongod` or an Atlas cluster).

```bash
git clone <your-fork-url> gahezlak && cd gahezlak

# Backend
cd backend
npm ci
cp .env.example .env      # then fill it in — see below
npm run seed:roles:dev    # required: registration fails without the roles collection
npm run dev               # http://localhost:3000

# Frontend, in a second terminal
cd frontend
npm ci
npm run dev               # http://localhost:5173
```

`backend/.env.example` documents every variable the API reads, what breaks when it is missing, and which ones are genuinely optional. The short version: `MONGODB_URI`, `JWT_SECRET` and `FRONTEND_URL` are required and the server refuses to start without them. Everything else degrades a single feature rather than blocking boot — but note that `IMGBB_KEY` is required *in practice*, because creating a shop generates and uploads a QR code.

The frontend needs `VITE_API_URL`. In development `frontend/.env.development` already points at `http://localhost:3000/api/v1`.

### Optional feature flags

- **AI menu features** (photo-to-menu OCR, allergy- and diet-aware search) are **off by default**. They need `ANTHROPIC_API_KEY` on the backend *and* `VITE_AI_ENABLED=true` on the frontend — setting only one gives you either a UI whose requests are refused, or working endpoints with no way to reach them. Note that enrichment must be run per shop (`POST /ai/menu/enrich-all`); until it does, dietary filters correctly treat every item as unsafe and show nothing.
- **Payments** need a Paymob account. Each integration has one job: card/3DS for checkout, wallet for mobile wallets, MOTO for recurring subscription deductions, and a verification integration for the first transaction of a free trial (so the customer is verified without being charged). Cash means pay in person and never touches Paymob.

### Seeding

```bash
cd backend
npm run seed:roles:dev    # roles — registration depends on this
npm run seed:plans:dev    # subscription plans (creates them on Paymob first)
```

Both are idempotent and safe to re-run.

## Testing

```bash
cd backend  && npm test    # Vitest + supertest, real mongod in-memory
cd frontend && npm test    # Vitest + React Testing Library
```

Neither suite needs a running database or any external credentials — the backend spins up its own `mongod`, and third-party APIs are mocked.

Lint and typecheck:

```bash
npm run lint            # in either package
npx tsc --noEmit        # backend
npx tsc -b --noEmit     # frontend (covers the SPA, the Vite config and the server)
```

From the repo root, `npm run format` applies Prettier and `npm run format:check` verifies it. A husky pre-commit hook formats staged files automatically.

## Deployment

Both halves deploy to [Render](https://render.com) as long-running Node web services, described by `render.yaml`.

The frontend is a **web service, not a static site**, on purpose: its Express server rewrites `<head>` per shop so link-preview scrapers and search engines see real per-restaurant metadata, and it serves a `/sitemap.xml` built from live data. Both require a request-time call to the API, which a static bucket cannot do.

Health checks: `GET /health` on the API (returns `{"status":"ok","db":"connected"}`) and `GET /healthz` on the frontend.

Two deployment notes that are easy to get wrong:

- `VITE_API_URL` must be set in the frontend service's **build** environment, not just at runtime. Vite inlines it into the bundle at build time and the server reads it again at boot to derive the CSP. Set it only at runtime and the health check passes while every API call fails.
- If you use MongoDB Atlas, add Render's egress IPs to the access list. A developer-machine allowlist will not cover them.

## CI

GitHub Actions runs typecheck, lint, tests and a real build for both packages on every push to `main` and every pull request. It requires **no repository secrets** — the backend suite provides its own database and the frontend build needs no baked-in configuration.

There is deliberately no deploy job: Render watches this repository directly, and a second deploy path would race with it.

## License

No license has been chosen yet. Until one is added, all rights are reserved and this code is not licensed for reuse.
