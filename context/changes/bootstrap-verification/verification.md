---
bootstrapped_at: 2026-05-21T23:27:39Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: takecare
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: takecare
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Solo after-hours MVP (3 weeks, small scale) shipping a web app with Magic Link auth, per-user PDF upload, JSON persistence, and Markdown reports. The vetted default for web + JavaScript — 10x-astro-starter — bundles TypeScript, Supabase (auth + storage + Postgres), and Cloudflare Pages in one agent-friendly, convention-based stack that clears all four quality gates. Standard path: no custom framework comparison. Auth is in scope; payments, realtime, and explicit AI/queue features are out per PRD. Deploy to cloudflare-pages (starter default); GitHub Actions with auto-deploy on merge. PDF extraction may later need a worker or queue beyond edge limits — noted for implementation, not a stack blocker for v1 scaffold.

## Pre-scaffold verification

| Signal             | Value                              | Severity | Notes                              |
| ------------------ | ---------------------------------- | -------- | ---------------------------------- |
| npm package        | not run                            | —        | cmd_template uses git clone        |
| GitHub repo        | not run                            | —        | gh CLI not available on host       |

Recency check unavailable: `gh` not recognized. Proceeding per WARN-AND-CONTINUE.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 19

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: append-merged (cwd patterns preserved; starter patterns de-duped and appended with `# from 10x-astro-starter`)

**.bootstrap-scaffold cleanup**: deleted (`.git/` removed from clone before move-up)

npm install reported 10 vulnerabilities (9 moderate, 1 high) during install; post-scaffold audit captured separately.

## Post-scaffold audit

**Tool**: npm audit --json

**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW

**Direct vs transitive**: not distinguished in summary metadata (per-package `isDirect` available in raw report)

#### CRITICAL findings

(none)

#### HIGH findings

- **devalue** (transitive) — GHSA-77vg-94rm-hx3p: DoS via sparse array deserialization; range >=5.6.3 <=5.8.0

#### MODERATE findings

- **@astrojs/check** (direct) — via @astrojs/language-server
- **@astrojs/language-server** (transitive)
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler, ws
- **miniflare**, **wrangler**, **ws**, **volar-service-yaml**, **yaml-language-server** (transitive chain) — see full `npm audit` output for advisory IDs

#### LOW / INFO findings

(none)

Audit exit code: 1 (npm audit reports vulnerabilities when present; informational only).

## Hints recorded but not acted on in v1

- `team_size`: solo — logged only; no CI/scaffold customization
- `deployment_target`: cloudflare-pages — logged; wrangler.jsonc shipped by starter
- `ci_provider`: github-actions — no workflow generated in v1
- `ci_default_flow`: auto-deploy-on-merge — no workflow generated in v1
- `path_taken`: standard
- `quality_override`: false
- `self_check_answers`: null
- `has_auth`: true — Supabase auth in starter; RLS configuration remains user responsibility
- `has_payments`, `has_realtime`, `has_ai`, `has_background_jobs`: false

## Next steps

- Copy `.env.example` to `.env` and configure Supabase + Cloudflare credentials per starter README.
- Review HIGH/MODERATE audit findings (`npm audit`, `npm audit fix` where safe).
- Run `npm run dev` to verify local startup.
- Future skill will add `AGENTS.md` / `CLAUDE.md` agent context (not generated in bootstrapper v1).
- `context/` preserved — PRD, shape-notes, and tech-stack hand-off remain under `context/foundation/`.
