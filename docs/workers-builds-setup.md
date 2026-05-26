# Workers Builds setup (manual dashboard)

Connect GitHub auto-deploy after the first CLI deploy exists.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **takecare** → **Settings** → **Builds** → **Connect**
2. Authorize GitHub and select the **TakeCare** repository
3. Configure:

| Field | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build:production` |
| Deploy command | `npx wrangler deploy --env=""` |
| Non-production deploy command | `npx wrangler versions upload --env staging` |

4. **Build variables and secrets:** add `SUPABASE_URL` and `SUPABASE_KEY` (anon key; build-time only)
5. Push to `main` and confirm build + deploy in **Deployments → View build history**

**Fork PRs:** fork builds may lack secrets; rely on GitHub Actions CI for fork PR validation.

**Billing:** enable alerts under **Billing** before exceeding Workers free tier (100k requests/day).
