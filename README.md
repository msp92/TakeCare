# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .dev.vars.example .dev.vars
```

On PowerShell: `Copy-Item .dev.vars.example .dev.vars`

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run sync` - Generate Astro types (CI parity)
- `npm run build` - Build for production
- `npm run build:staging` / `npm run build:production` - Environment-specific builds
- `npm run deploy` / `npm run deploy:staging` - Build and deploy to Cloudflare
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://127.0.0.1:54323` (Mailpit for auth emails: `http://127.0.0.1:54324`).

### Database schema and migrations (F-01)

Lab data lives in Postgres (`uploads`, `extractions`, `reports`) with row-level security, plus a private Storage bucket `lab-pdfs` for PDFs. Migrations are in `supabase/migrations/`.

After `npx supabase start`, apply (or re-apply) the schema:

```bash
npx supabase db reset
```

This runs all migrations and `supabase/seed.sql` (no seed rows in F-01 — use Studio or S-01 fixtures).

| Service | Local URL                |
| ------- | ------------------------ |
| API     | `http://127.0.0.1:54321` |
| Studio  | `http://127.0.0.1:54323` |

Schema and policy details: see `supabase/migrations/` — `20260527100000_create_core_schema.sql`, `20260527100100_enable_rls_policies.sql`, `20260527100200_storage_lab_pdfs_bucket.sql`.

Upload/extraction/report features in the app depend on these migrations — plan them in slice **S-01** (`first-pdf-to-report`). **DELETE** policies for tables and Storage are deferred to S-01.

**Remote project:** link the repo to cloud (`npx supabase link`) and push migrations with `npx supabase db push` before testing with real health data.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/) (`wrangler.jsonc`, worker name `takecare`). Full runbook: [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md).

1. Authenticate: `npx wrangler login`
2. Set runtime secrets: `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY` (anon key only)
3. Deploy production: `npm run deploy` (builds with `CLOUDFLARE_ENV=production`, then `wrangler deploy`)
4. Staging (optional): `npm run deploy:staging` → worker `takecare-staging`

Configure Supabase **Authentication → URL Configuration** with your `*.workers.dev` or custom domain before testing email confirmation in production.

## CI

GitHub Actions runs lint + build on every push and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

For auto-deploy on push, connect the repo in Cloudflare Dashboard → Worker `takecare` → Settings → Builds ([workers-builds-setup.md](docs/workers-builds-setup.md)).

Production: `https://takecare.msp92.workers.dev` — configure Supabase redirect URLs per [cloudflare-deployment.md](docs/cloudflare-deployment.md).

## License

MIT
