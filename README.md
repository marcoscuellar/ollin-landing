# Ollin — Landing Page

The Ollin coming-soon page with a working waitlist.

## Deploy (one time, ~5 minutes)

1. Push this folder to a new GitHub repo (e.g. `ollin-landing`)
2. vercel.com → **Add New → Project** → import the repo → Deploy
3. In the new Vercel project: **Storage → Create Database → Upstash Redis (KV)** → connect it.
   This auto-adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. **Settings → Domains** → add your new domain
5. Redeploy. Done — signups land in the `ollin:waitlist` Redis set.

## Check signups
GET `/api/waitlist?code=YOUR-SETUP-CODE` (same owner code as the COS app).
