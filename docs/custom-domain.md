# Custom domain (optional)

Use when moving off `*.workers.dev` for production auth stability (SameSite cookies).

1. Cloudflare Dashboard → **takecare** → **Settings** → **Domains** → **Add Custom Domain**
2. Add DNS (Cloudflare-proxied CNAME) pointing to the worker
3. Supabase → **Authentication → URL Configuration**:
   - Update **Site URL** to `https://<your-domain>`
   - Update **Redirect URLs** to `https://<your-domain>/auth/callback`
4. Re-run auth smoke test (sign-up, email confirm, sign-in, `/dashboard`)
5. Remove old `workers.dev` entries from Supabase when the custom domain is stable
