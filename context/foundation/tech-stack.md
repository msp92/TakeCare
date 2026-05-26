---
starter_id: 10x-astro-starter
package_manager: npm
project_name: takecare
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

Solo after-hours MVP (3 weeks, small scale) shipping a web app with Magic Link auth, per-user PDF upload, JSON persistence, and Markdown reports. The vetted default for web + JavaScript — 10x-astro-starter — bundles TypeScript, Supabase (auth + storage + Postgres), and Cloudflare Pages in one agent-friendly, convention-based stack that clears all four quality gates. Standard path: no custom framework comparison. Auth is in scope; payments, realtime, and explicit AI/queue features are out per PRD. Deploy to cloudflare-workers (wrangler.jsonc + @astrojs/cloudflare); GitHub Actions with auto-deploy on merge. PDF extraction may later need a worker or queue beyond edge limits — noted for implementation, not a stack blocker for v1 scaffold.
