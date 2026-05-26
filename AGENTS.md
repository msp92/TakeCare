# Repository Guidelines

TakeCare aggregates pre-anonymized lab PDFs into longitudinal Markdown reports. Stack: Astro 6 on Cloudflare, React 19, TypeScript strict, Tailwind 4, Supabase. Scope: @context/foundation/prd.md; stack: @context/foundation/tech-stack.md.

## Hard Rules

- Do not create or edit anything under `context/archive/` — archived changes are immutable; start a new change instead.
- Keep `SUPABASE_URL` and `SUPABASE_KEY` server-only: declared in @astro.config.mjs `env.schema` with `access: "secret"`. Never expose them in client bundles or public env.
- Register new authenticated pages in `PROTECTED_ROUTES` in @src/middleware.ts (pattern: `context.url.pathname.startsWith(route)`).
- MVP: pre-anonymized PDFs only, single facility template, no auto-anonymization, no diagnostic/treatment claims in UI (@context/foundation/prd.md).
- Foundation docs in `context/foundation/` (edit-in-place, @context/foundation/README.md). Change-scoped work under `context/changes/<change-id>/`.

## Project Structure

- `src/pages/` — Astro routes; API handlers under `src/pages/api/`.
- `src/components/` — UI (Astro and React); shared primitives under `src/components/ui/`.
- `src/lib/` — Supabase client and shared utilities (`@/` alias maps to `src/` per @tsconfig.json).
- `public/` — static assets; `wrangler.jsonc` — Cloudflare deploy config.
- @README.md — local Supabase Docker setup, auth routes, and deployment steps.

## Build, Test, and Development Commands

Use Node **22.14.0** (@.nvmrc). Run scripts from @package.json. Before lint (CI and local parity), run `npx astro sync` — see @.github/workflows/ci.yml.

No automated test runner is configured yet; add tests only when a framework is introduced.

## Coding Style

- TypeScript extends `astro/tsconfigs/strict`; import app code via `@/…` paths.
- ESLint: `strictTypeChecked` + Prettier integration; `no-console` is warn; unused symbols must be prefixed with `_`.
- Pre-commit: Husky runs `lint-staged` (@package.json) — staged `*.{ts,tsx,astro}` get `eslint --fix`; JSON/CSS/MD get Prettier.

## Commit & Pull Request Guidelines

No commits yet — set message convention on first push. CI (@.github/workflows/ci.yml) on **`main`**: `npm ci`, `npx astro sync`, lint, build (Supabase secrets required). Run lint + build locally before PRs.

## Security & Configuration

Secrets, local env files, Supabase setup, and deployment: @README.md.
