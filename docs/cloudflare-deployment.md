# Cloudflare Workers deployment runbook

Operational checklist for TakeCare. Canonical platform decision: `context/foundation/infrastructure.md`.

## Secret surfaces (keep in sync on rotation)

| Surface | Purpose |
| --- | --- |
| `.dev.vars` | Local workerd dev |
| `npx wrangler secret put` | Runtime on deployed Worker(s) |
| GitHub repo secrets | CI lint/build (`.github/workflows/ci.yml`) |
| Workers Builds → Build variables | Build-time only (not runtime) |

Use the Supabase **anon/public** key for `SUPABASE_KEY` everywhere. Never use `service_role` in this app.

## Prerequisites

- Cloudflare account, Supabase project, GitHub repo access
- Node 22 (`nvm install` or match `.nvmrc`)
- `npm ci` then `npm run sync`

## Local pre-flight

```powershell
Copy-Item .dev.vars.example .dev.vars   # fill SUPABASE_URL + anon key
npm run sync
npm run lint
npm run build
npm run dev
```

## Wrangler auth

```bash
npx wrangler login
npx wrangler whoami
```

## Production secrets

```bash
# Top-level worker (production) — use empty env flag when staging env exists in wrangler.jsonc
npx wrangler secret put SUPABASE_URL --env=""
npx wrangler secret put SUPABASE_KEY --env=""
npx wrangler secret list
```

For staging: repeat with `npx wrangler secret put SUPABASE_URL --env staging` (and `SUPABASE_KEY`).

## Deploy

**Production (default worker `takecare`):**

```bash
npm run deploy
```

**Staging (`takecare-staging`):**

```bash
npm run deploy:staging
```

Manual equivalent: `npm run build` (or `npm run build:production`) then `npx wrangler deploy`. Production uses the top-level `wrangler.jsonc` worker `takecare`; only staging uses `CLOUDFLARE_ENV=staging`.

## Deployed URLs (this account)

Workers.dev hostnames use **`<worker-name>.<your-account-subdomain>.workers.dev`**. The middle label (`msp92`, `maciekspyra`, etc.) is set once per Cloudflare account, not in this repo or in Supabase.

| Environment | URL (when account subdomain is `msp92`) |
| --- | --- |
| Production | `https://takecare.msp92.workers.dev` |
| Staging | `https://takecare-staging.msp92.workers.dev` |

After `npm run deploy`, Wrangler prints the live URL — use that as source of truth.

### Still on `maciekspyra.workers.dev` after updating Supabase?

Supabase **Site URL** only tells Supabase where to redirect users; it does **not** change Cloudflare routing. To change the Workers hostname:

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. At the top, find **Your subdomain** → **Change**
3. Set subdomain to **`msp92`** (one per account; replaces the previous label)
4. Redeploy: `npm run deploy` — confirm output shows `https://takecare.msp92.workers.dev`
5. Then set Supabase **Site URL** and **Redirect URLs** to that same host (see below)

The old `https://takecare.maciekspyra.workers.dev` URL stops working once the account subdomain changes.

### `DNS_PROBE_POSSIBLE` on the new `msp92` URL

The Worker can be healthy while your PC still fails to resolve the hostname (common right after changing the account subdomain).

1. **Confirm Cloudflare DNS** (should return IPv4):  
   `nslookup takecare.msp92.workers.dev 1.1.1.1` → expect `104.x` / `172.x` addresses.
2. **If your router DNS (`192.168.x.x`) only returns IPv6 or NXDOMAIN**, switch Windows DNS to **1.1.1.1** or **8.8.8.8** (Settings → Network → DNS).
3. **Flush caches:**  
   `ipconfig /flushdns`  
   Chrome: `chrome://net-internals/#dns` → Clear host cache (or restart browser).
4. **Retry** after 5–15 minutes (routers cache failed lookups).
5. **Supabase** must use the same host you can open in the browser: `https://takecare.msp92.workers.dev`.

## Supabase auth URLs (manual — dashboard)

Authentication → URL Configuration (use your production URL from the table above):

- **Site URL:** `https://takecare.msp92.workers.dev`
- **Redirect URLs:** `https://takecare.msp92.workers.dev/auth/confirm-email`

**Preview policy (recommended — strict):** do not add ephemeral `*.workers.dev` preview URLs unless you need QA on previews; remove when done.

**Cookie note:** `*.workers.dev` can cause SameSite issues; use a custom domain for production auth if cookies fail.

## Workers Builds (manual — dashboard)

See [workers-builds-setup.md](workers-builds-setup.md) for step-by-step dashboard setup.

Workers & Pages → `takecare` → Settings → Builds → Connect GitHub:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build:production` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy | `npx wrangler versions upload --env staging` |

Add `SUPABASE_URL` and `SUPABASE_KEY` under Build variables and secrets. Worker `name` in `wrangler.jsonc` must match the dashboard Worker name.

## Observability and rollback

```bash
npx wrangler tail
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

**Rollback triggers (examples):** auth failure spike, 5xx spike, broken sign-in.

**Post-rollback checks:** sign-in, `/dashboard`, auth API routes, clean logs for 10–15 minutes.

Rollback does **not** revert Supabase schema/data.

Enable billing alerts in Cloudflare Dashboard → Billing before exceeding free tier (100k requests/day).

## Custom domain (optional)

See [custom-domain.md](custom-domain.md).

1. Worker → Settings → Domains → Add Custom Domain
2. DNS (Cloudflare-proxied) to the worker
3. Update Supabase Site URL + Redirect URLs to the custom domain
4. Re-run auth smoke test; remove `workers.dev` URLs from Supabase when stable

## Edge cases

| Issue | Action |
| --- | --- |
| Worker name 409 | Use unique `name` in `wrangler.jsonc` (e.g. `takecare-app`) |
| SESSION KV deploy error | Already mitigated via null session driver in `astro.config.mjs`; if needed: `npx wrangler kv namespace create SESSION` and add binding |
| Workers Builds name mismatch | Reconnect Builds after aligning `wrangler.jsonc` `name` with dashboard |
| Fork PR builds | Forks lack repo secrets; CI on upstream PRs only |
