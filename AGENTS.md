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

| Command | Purpose |
| --- | --- |
| `npm test` | Vitest single run (`tests/**/*.test.ts`, Node env) |
| `npm run test:watch` | Vitest watch mode |
| `npm run verify:parser` | Manual smoke: print parsed JSON for fixture files (@scripts/verify-parser.ts) |

**CI today:** lint + build only — `npm test` is not gated yet (see @context/foundation/test-plan.md rollout Phase 4). Run `npm test` locally before PRs that touch parser, reports, or tests.

## Testing

Stack: **Vitest 4** in plain Node (@vitest.config.ts). No Miniflare / Workers pool for unit tests — target pure TS in `src/lib/services/` (no Astro, Supabase, or browser APIs).

- **Layout:** `tests/unit/*.test.ts`; import from `vitest` directly (`describe`, `it`, `expect`, `vi`); import app code via `@/…`.
- **Config:** `environment: "node"`, `include: ["tests/**/*.test.ts"]`, `@/` alias mirrors app tsconfig. Test files are in ESLint scope automatically (`tsconfig.json` includes `**/*`).
- **Fixtures:** real-OCR text + golden oracles under @scripts/fixtures/ (`*-ocr.txt`, `*-ocr.expected.json`). Load with `readFileSync` + `resolve(process.cwd(), "scripts/fixtures")`; prefer `beforeAll` for fixture I/O.
- **Oracle policy:** expected JSON reflects requirements, not current parser output. Rows with uncorrectable OCR corruption use `it.skip` with a comment naming the artifact — never lower the oracle to match bad OCR (@context/changes/testing-critical-path-pure-logic/plan.md skip table).
- **Current coverage:** `parseLabText` / date extraction / dedup (@tests/unit/parser.test.ts); `buildReportSection` / `mergeReportContent` + documented SQL append parity gap (@tests/unit/reports.test.ts).
- **Broader strategy:** phased rollout, risk map, and layer guidance in @context/foundation/test-plan.md — read before adding integration, RLS, or e2e tests.

**When adding tests:** keep new pure-logic tests under `tests/unit/`; use fixture-oracle pattern for parser changes; run `npm test && npm run lint && npm run build`.

## Coding Style

- TypeScript extends `astro/tsconfigs/strict`; import app code via `@/…` paths.
- ESLint: `strictTypeChecked` + Prettier integration; `no-console` is warn; unused symbols must be prefixed with `_`.
- Pre-commit: Husky runs `lint-staged` (@package.json) — staged `*.{ts,tsx,astro}` get `eslint --fix`; JSON/CSS/MD get Prettier.

## Commit & Pull Request Guidelines

- Prefer Conventional Commits for the subject (e.g. `feat(scope): short summary`); no fixed body format required.
- **Never** add `Co-Authored-By`, `Made-with: Cursor`, or other AI/IDE attribution lines to commit messages or PR descriptions.
- CI (@.github/workflows/ci.yml) on **`main`**: `npm ci`, `npx astro sync`, lint, build (Supabase secrets required). Run `npm test`, lint, and build locally before PRs.

## Security & Configuration

Secrets, local env files, Supabase setup, and deployment: @README.md.
