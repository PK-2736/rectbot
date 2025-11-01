# Domain Migration Guide: rectbot.tech → recrubo.net

This document lists all places to update when migrating from rectbot.tech to recrubo.net, with suggested new values and related GitHub Secrets.

Assumption: New primary domains
- API (Cloudflare Workers): https://api.recrubo.net
- Dashboard (Pages/Next.js): https://dash.recrubo.net (or your chosen subdomain)
- Website: https://recrubo.net
- Monitoring: grafana.recrubo.net, prom.recrubo.net, loki.recrubo.net, metabase.recrubo.net
- Support Email: support@recrubo.net

## 1) Application defaults (updated in this repo)

Bot
- bot/src/config.js: BACKEND_API_URL default → https://api.recrubo.net
- bot/src/utils/backendFetch.js: API_BASE default → https://api.recrubo.net
- bot/src/commands/help.js: links → https://recrubo.net

Backend Workers
- backend/index.js:
  - CORS allowedOrigins → dash.recrubo.net, recrubo.net
  - Image proxy target → https://api.recrubo.net
  - Email defaults: support@recrubo.net, dkim_domain: recrubo.net, noreply@recrubo.net
- backend/src/index.js:
  - Default CORS_ORIGINS → https://recrubo.net, https://www.recrubo.net, https://dash.recrubo.net
- backend/wrangler.toml: comment route example → https://api.recrubo.net/*
- backend/dashboard-proxy-worker/index.js:
  - Example API URLs → https://api.recrubo.net
  - Redirect → https://dash.recrubo.net/login
  - Cookie domain note: .recrubo.net
- backend/dashboard-proxy-worker/wrangler.toml: route → api.recrubo.net/*

Dashboard (Next.js)
- frontend/dashboard/src/lib/config.ts: redirectUri default → https://api.recrubo.net/api/discord/callback
- frontend/dashboard/src/lib/discord-auth.ts: default redirectUri → https://api.recrubo.net/api/discord/callback
- frontend/dashboard/src/components/AuthProvider.tsx: default API base → https://api.recrubo.net
- frontend/dashboard/src/components/AdminDashboard.tsx: default API base + redirectUri → recrubo.net
- frontend/dashboard/functions/api/*.ts: default BACKEND_API_URL → https://api.recrubo.net
- frontend/dashboard/README.md: examples (NEXT_PUBLIC_*) → dash.recrubo.net, api.recrubo.net
- frontend/dashboard/wrangler.toml: BACKEND_API_URL example → api.recrubo.net

Website (Astro)
- frontend/astro/src/pages/support.astro: host match and API URL → recrubo.net / https://api.recrubo.net/api/support
- frontend/astro/src/layouts/BaseLayout.astro: commented dashboard URL → dash.recrubo.net

Monitoring Docs
- docker/monitoring/*: already uses recrubo.net (grafana/prom/loki/metabase)

## 2) GitHub Secrets / Environment variables to update

Repository/Org Secrets (names may vary by workflow/app):
- BACKEND_API_URL = https://api.recrubo.net
- PUBLIC_API_BASE_URL or NEXT_PUBLIC_API_BASE_URL = https://api.recrubo.net
- WORKER_API_BASE_URL (if used) = https://api.recrubo.net
- DISCORD_REDIRECT_URI = https://api.recrubo.net/api/discord/callback
  - If you terminate OAuth on the dashboard instead: https://dash.recrubo.net/auth/callback
- NEXT_PUBLIC_DISCORD_REDIRECT_URI = one of the above depending on architecture
- CORS_ORIGINS = https://recrubo.net,https://www.recrubo.net,https://dash.recrubo.net
- SUPPORT_EMAIL = support@recrubo.net
- DKIM domain/config (Mail provider) updated to recrubo.net

Other related secrets (unchanged names, verify values):
- SERVICE_TOKEN (no change, ensure all clients use same token)
- SUPABASE_URL / SUPABASE_REST_URL (unchanged unless domain-based proxy)
- SUPABASE_SERVICE_ROLE_KEY (unchanged)

## 3) Cloudflare configuration

- Workers custom domain: map api.recrubo.net to the Worker
- Pages (dashboard): set custom domain dash.recrubo.net
- Access / Zero Trust (if used): update app hostname(s) to recrubo.net
- DNS records (A/AAAA/CNAME): update to new hosts as needed
- Email (Mailchannels):
  - From/Reply-To: noreply@recrubo.net, support@recrubo.net
  - DKIM domain: recrubo.net (rotate keys if domain changed)

## 4) SDKs / OAuth redirect URLs

- Discord Developer Portal
  - OAuth2 Redirect URIs: add https://api.recrubo.net/api/discord/callback
  - (or) add https://dash.recrubo.net/auth/callback if using dashboard handler

## 5) Rollout checklist

- [ ] Update GitHub Secrets listed above
- [ ] Deploy Workers with new route domain (api.recrubo.net)
- [ ] Update Pages custom domain (dash.recrubo.net) and re-deploy
- [ ] Verify CORS: call /api/ping from dashboard and website
- [ ] Verify OAuth login/logout flows
- [ ] Verify emails (support@recrubo.net) including DKIM/DMARC
- [ ] Update external links in README/wiki/socials

## Notes
- For a safer migration, temporarily keep rectbot.tech origins in CORS via env `CORS_ORIGINS` until DNS cutover completes.
- If any client still hardcodes rectbot.tech, search and replace with `git grep -n 'rectbot.tech'`.
