# TakeCare

TakeCare aggregates pre-anonymized laboratory PDFs into a longitudinal Markdown report on your account — material for a doctor visit, not medical advice. Upload PDFs from **Diagnostyka** (≤2 pages, selectable text, already redacted by you), and the app extracts results, stores structured JSON, and builds a report that persists across sessions.

Product scope and requirements: [`context/foundation/prd.md`](context/foundation/prd.md).

## Tech Stack

- [Astro](https://astro.build/) v6 — SSR on Cloudflare Workers
- [React](https://react.dev/) v19 — interactive islands (upload, dashboard)
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Supabase](https://supabase.com/) — Magic Link auth, Postgres + RLS, Storage for PDFs
- [Cloudflare Workers](https://workers.cloudflare.com/) — production runtime

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- npm
- [Docker](https://www.docker.com/) — for local Supabase (~7 GB RAM)

## Getting Started

1. Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd TakeCare
npm install
```

2. Copy environment files:

```bash
cp .env.example .env
cp .dev.vars.example .dev.vars
```

On PowerShell: `Copy-Item .env.example .env; Copy-Item .dev.vars.example .dev.vars`

3. Start local Supabase and apply migrations — see [Supabase Configuration](#supabase-configuration).

4. Run the dev server:

```bash
npm run dev
```

5. Open the app, sign in with Magic Link (check Mailpit at `http://127.0.0.1:54324` locally), upload a Diagnostyka PDF on `/upload`, and view the report on `/dashboard`.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Cloudflare workerd runtime) |
| `npm run sync` | Generate Astro types (CI parity) |
| `npm run build` | Production build |
| `npm run build:staging` / `npm run build:production` | Environment-specific builds |
| `npm run deploy` / `npm run deploy:staging` | Build and deploy to Cloudflare |
| `npm run preview` | Preview production build |
| `npm test` | Vitest unit tests (`tests/unit/`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run verify:parser` | Manual smoke — print parsed JSON for fixture files |
| `npm run lint` / `npm run lint:fix` | ESLint with type-checked rules |
| `npm run format` | Prettier |

## Project Structure

```text
.
├── context/foundation/     # PRD, roadmap, test plan (10x workflow)
├── src/
│   ├── pages/              # Astro routes + API handlers (src/pages/api/)
│   ├── components/         # Astro + React UI
│   ├── lib/
│   │   └── services/       # Parser, uploads, reports, deletes
│   └── middleware.ts       # Auth session + protected routes
├── supabase/migrations/    # Schema, RLS, Storage policies, RPC
├── scripts/fixtures/         # Parser fixture-oracle files
├── tests/unit/             # Vitest unit tests
└── wrangler.jsonc          # Cloudflare Workers config
```

## Supabase Configuration

Environment variables (`SUPABASE_URL`, `SUPABASE_KEY`) are declared in `astro.config.mjs` as **server-only secrets** — never exposed to the client bundle.

### Local Supabase

1. Start the stack (migrations are already in `supabase/migrations/`):

```bash
npx supabase start
npx supabase db reset
```

2. Copy credentials from the CLI output into `.env` and `.dev.vars`:

```text
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

3. Local services:

| Service | URL |
| --- | --- |
| API | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| Mailpit (Magic Link emails) | `http://127.0.0.1:54324` |

Stop when done: `npx supabase stop`

### Database schema

Lab data lives in Postgres (`uploads`, `extractions`, `reports`) with row-level security per `user_id`, plus a private Storage bucket `lab-pdfs` for PDFs (`{user_id}/{upload_id}.pdf`).

Key migrations:

- `20260527100000_create_core_schema.sql` — tables
- `20260527100100_enable_rls_policies.sql` — RLS SELECT/INSERT/UPDATE
- `20260527100200_storage_lab_pdfs_bucket.sql` — Storage bucket policies
- `20260601100000_delete_rls_policies.sql` — DELETE policies (tables + Storage)
- `20260602120000_complete_upload_processing_rpc.sql` — atomic extraction + report merge

### Cloud Supabase project

Add the same variables to `.env` and `.dev.vars`:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Link and push migrations before using real health data:

```bash
npx supabase link
npx supabase db push
```

Configure **Authentication → URL Configuration** with your app origin and `/auth/callback` redirect.

### Auth routes

| Route | Description |
| --- | --- |
| `/auth/signin` | Magic Link sign-in (email only) |
| `/auth/confirm-email` | “Check your inbox” after OTP sent |
| `/auth/callback` | Magic Link callback (establishes session) |
| `/upload` | PDF upload (protected) |
| `/dashboard` | Longitudinal report + upload history (protected) |

Route protection: `src/middleware.ts` (`PROTECTED_ROUTES`). API handlers also check `context.locals.user`.

## Testing

Test strategy and risk map: [`context/foundation/test-plan.md`](context/foundation/test-plan.md).

```bash
npm test
```

Parser changes should use the fixture-oracle pattern under `scripts/fixtures/` — see `tests/unit/parser.test.ts`.

## Deployment

Deploys to [Cloudflare Workers](https://workers.cloudflare.com/) (`wrangler.jsonc`, worker name `takecare`). Full runbook: [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md).

1. `npx wrangler login`
2. `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY` (anon key only)
3. `npm run deploy` — production (`CLOUDFLARE_ENV=production`)
4. Staging (optional): `npm run deploy:staging` → worker `takecare-staging`

Production: `https://takecare.msp92.workers.dev` — configure Supabase redirect URLs per [cloudflare-deployment.md](docs/cloudflare-deployment.md).

## CI

GitHub Actions runs lint + build on every push and PR to `main`. Set `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.

For auto-deploy on push: Cloudflare Dashboard → Worker `takecare` → Settings → Builds ([workers-builds-setup.md](docs/workers-builds-setup.md)).

## License

MIT
