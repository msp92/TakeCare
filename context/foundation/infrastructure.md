---
project: TakeCare
researched_at: 2026-05-24
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Node 22 (build) / workerd (production via @astrojs/cloudflare v13.5)
---

## Recommendation

**Deploy on Cloudflare Workers** (not Cloudflare Pages as a separate product).

TakeCare is already scaffolded with `@astrojs/cloudflare` v13, `output: "server"`, and `wrangler.jsonc` using the Workers `assets` binding — matching Astro 6’s supported path. Interview answers: stateless request/response (Q1), no cost/DX preference (Q2), **existing Cloudflare familiarity** (Q3), single-region users (Q4), **external Supabase** acceptable (Q5). Cloudflare wins on zero adapter migration, CLI-first ops (`wrangler`), agent-readable docs (`llms.txt`, `docs.mcp.cloudflare.com`), and official MCP servers — with risks from PDF CPU limits and Astro 6 environment-specific builds captured below.

## Platform Comparison

Hard filter applied: Q1 = No persistent connections → no platform dropped for serverless-only limitation.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total (Pass=1, Partial=0.5, Fail=0) |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5.0** |
| Vercel | Pass | Pass | Pass | Pass | Partial (public beta; read-focused) | 4.5 |
| Netlify | Pass | Pass | Partial | Pass | Partial | 4.0 |
| Fly.io | Pass | Pass | Pass | Pass | Fail | 4.0 |
| Railway | Pass | Pass | Partial | Pass | Partial | 4.0 |
| Render | Pass | Pass | Partial | Pass | Partial | 4.0 |

**Weights applied:** Q3 familiarity → Cloudflare tie-break; Q4 single region → edge/CDN less decisive; Q5 external Supabase → no co-location requirement; Q2 neutral on cost vs DX.

### Cloudflare Workers
- **CLI-first:** `wrangler deploy`, `wrangler versions upload`, `wrangler rollback`, `wrangler tail` — full loop without dashboard (Pass).
- **Managed:** Workers + assets binding; no VM patching (Pass).
- **Docs:** `developers.cloudflare.com` publishes `llms.txt`; `https://docs.mcp.cloudflare.com/mcp` (Pass).
- **Deploy API:** Deterministic CLI + Workers Builds on Git push (Pass).
- **MCP:** `https://mcp.cloudflare.com/mcp` (Code Mode) plus product servers (observability, builds, bindings) (Pass).
- **Cost (MVP):** Workers Free — 100,000 requests/day; Paid from **$5/month** account minimum with higher quotas ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
- **Astro 6:** `@astrojs/cloudflare` v13+; `astro dev` uses Cloudflare Vite plugin + **workerd** (production-parity local dev). Deploy: `npm run build` then `npx wrangler deploy`. **Note:** Astro 6 SSR on legacy Pages config is reported unsupported; this repo correctly targets **Workers** (`wrangler.jsonc` `main` + `assets`).

### Vercel
- Strong `@astrojs/vercel` adapter and `vercel deploy --prebuilt` (Pass on most criteria).
- **Gap:** Requires replacing `@astrojs/cloudflare`, re-validating Supabase cookie middleware, and new secret model. MCP is **public beta**, initially read-oriented ([Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp)).
- **Cost:** Hobby tier usable for MVP; function limits apply per plan.

### Netlify
- `@astrojs/netlify` supports SSR via Functions (Pass CLI/deploy).
- **Gap:** WebSockets/persistent ports not supported on Functions ([forum guidance](https://answers.netlify.com/t/url-of-websocket-opened-by-be/125098)); credit-based pricing from Sep 2025 for new accounts. Less alignment with current repo than Cloudflare.

### Fly.io
- `@astrojs/node` + `fly launch` / `fly deploy`; persistent Machines, WebSockets native (Pass ops for future PDF worker).
- **Gap:** Adapter swap + container Dockerfile maintenance; no official Cloudflare-class MCP. ~$2–7/mo for small always-on Machine ([Fly pricing](https://fly.io/docs/about/pricing/)).

### Railway
- Excellent DX, GitHub deploy, optional co-located Postgres — **not needed** (Supabase external).
- **Gap:** Adapter swap to Node; usage-based billing can exceed edge free tier at always-on 2 vCPU.

### Render
- Predictable $7/mo Starter (always-on); PR previews; background workers for future jobs.
- **Gap:** Adapter swap; free tier sleeps; weaker fit when Cloudflare is already integrated.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Best fit: repo already on Workers model, developer knows Cloudflare, stateless Astro SSR + external Supabase, MVP traffic within free tier. MCP and `wrangler` align with agent-driven maintenance.

#### 2. Vercel

Best alternative if Cloudflare edge limits block PDF processing and you want to stay serverless without containers — swap adapter, gain mature preview UX and Vercel MCP (beta).

#### 3. Fly.io

Best alternative if v1 PDF extraction needs **long CPU** or persistent Node libraries — run Astro on `@astrojs/node` or offload extraction to a Fly Machine while keeping the web tier on Workers.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **PDF extraction CPU** — Workers CPU time per invocation is tight on Free; parsing in-request may timeout or return partial results.
2. **Pages vs Workers confusion** — `tech-stack.md` mentions `cloudflare-pages`; production path is **Workers** + `assets` — wrong docs cause failed deploys.
3. **Per-environment builds (Astro 6)** — `CLOUDFLARE_ENV=<env> astro build` then deploy; single build reused across envs can bind wrong secrets.
4. **Preview URLs (beta)** — Branch previews: workers.dev only, Wrangler ≥4.21, limitations for Durable Objects ([changelog Jul 2025](https://developers.cloudflare.com/changelog/post/2025-07-23-workers-preview-urls/)).
5. **Vendor coupling** — `@astrojs/cloudflare` APIs (`astro:env`, middleware on workerd) increase migration cost vs Node adapters.

### Pre-Mortem — How This Could Fail

The team shipped TakeCare on Cloudflare Workers with Supabase, assuming edge hosting would stay simple through MVP. PDF upload worked locally under `astro dev` (workerd), but production extraction timed out under CPU limits, producing silent partial JSON. Retries burned the 100k/day free quota. Staging used one build artifact for multiple environments until `CLOUDFLARE_ENV` per-environment builds were enforced. PR preview URLs were documented but beta limitations (workers.dev only) led QA to hit production. When extraction was moved to Fly.io, the project ran two deploy pipelines and duplicated secrets without a rollback playbook for Supabase data. The infrastructure decision was never updated in foundation docs, so agents kept optimizing for Workers-only paths.

### Unknown Unknowns

- **Local dev is workerd**, not Node — native modules and timing may differ from `astro preview` expectations.
- **Three secret surfaces** must match: `.env` / `.dev.vars`, `wrangler secret put`, GitHub Actions `SUPABASE_*` (CI already requires them).
- **Rollback** is version-based (`wrangler versions list` / promote or rollback), not “git revert = instant prod” — plan for Supabase migrations separately.
- **Workers Paid** ($5/mo minimum) triggers once free quotas are exceeded — set billing alerts.
- **MCP assists operations** but does not replace `wrangler deploy` or Workers Builds in CI.

## Operational Story

- **Preview deploys:** Connect repo in Workers **Builds** (dashboard → Worker → Settings → Builds). Non-production branches use `npx wrangler versions upload` by default, yielding preview URLs on `*.workers.dev` ([build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)). Branch alias previews on PRs are **beta** (Jul 2025) — workers.dev only; comment posted on PR when enabled. Fork PR secrets may need explicit GitHub configuration.
- **Secrets:** Server secrets via Astro `env.schema` in @astro.config.mjs (`access: "secret"`). Local: `.dev.vars` (see @README.md). Production: `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY`. CI: GitHub repository secrets (see @.github/workflows/ci.yml). Rotation: update Supabase + wrangler secrets + GitHub secrets together; redeploy.
- **Rollback:** `npx wrangler deployments list` → `npx wrangler rollback [deployment-id]` or promote a previous version from Version History in dashboard. Typical revert is minutes; **does not** roll back Supabase schema/data.
- **Approval:** Human should approve production promotion, primary secret rotation, and any destructive Supabase change. Agent may run `npm run lint`, `npm run build`, `npx wrangler versions upload` on feature branches if credentials are scoped to non-production.
- **Logs:** `npx wrangler tail` (runtime); Workers Builds logs in dashboard **Deployments → View build history**; MCP: `https://observability.mcp.cloudflare.com/mcp` or `https://builds.mcp.cloudflare.com/mcp` (OAuth/token required).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| PDF parsing exceeds Worker CPU/time | Devil's advocate / PRD | M | H | Keep extraction off the hot request path in v1; spike Queues, Fly Machine, or Supabase-side processing before promising FR-003 at scale |
| Staging/prod secret mismatch | Unknown unknowns / Astro 6 | M | H | Document `CLOUDFLARE_ENV=<env> npm run build` per environment; verify bindings after each deploy |
| Pages vs Workers deploy path confusion | Devil's advocate / Research | M | M | Treat `wrangler.jsonc` Workers config as canonical; update @context/foundation/tech-stack.md `deployment_target` to `cloudflare-workers` when editing stack doc |
| Preview URL beta gaps | Research finding | L | M | Use Workers Builds preview URLs for PRs; protect with Cloudflare Access if URLs are public |
| Free tier quota exhaustion | Unknown unknowns | L | M | Monitor request count; enable billing alerts before Workers Paid |
| CI build fails without Supabase secrets | Research / repo | M | M | Keep `SUPABASE_URL` and `SUPABASE_KEY` in GitHub secrets (already in CI workflow) |

## Getting Started

1. **Local dev (Astro 6 + workerd):** `cp .env.example .dev.vars`, fill Supabase vars, then `npm run dev` — uses Cloudflare Vite plugin (no separate `wrangler dev` needed for daily UI work).
2. **Production build + deploy:** `npm run build` then `npx wrangler deploy` (from repo root; config in @wrangler.jsonc).
3. **Production secrets:** `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
4. **GitHub auto-deploy:** Connect repository under Worker → **Builds**; set build command `npm run build`, deploy command `npx wrangler deploy` (production branch `main`); add same Supabase secrets in GitHub for CI (@.github/workflows/ci.yml already runs lint + build).
5. **Verify rollback path:** After first deploy, run `npx wrangler deployments list` and note how to `wrangler rollback` before shipping PDF features.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (beyond noting existing GitHub Actions + Workers Builds options)
- Production-scale architecture (multi-region HA, DR, dedicated support tiers)
