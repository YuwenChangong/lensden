# Lensden

Lensden is an AR/AI glasses knowledge base built with Astro + Starlight. Developed and maintained by Jayden.

Contact: [lensden.team@gmail.com](mailto:lensden.team@gmail.com)

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Forum Phase 3 auth gate

Minimal auth route:

- `/forum/`

Required env vars:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Setup:

1. Copy `.env.example` to `.env`
2. Fill values from Supabase project settings
3. Run `npm run dev` and open `/forum/`

Current scope:

- email/password sign up
- email/password sign in
- session refresh
- sign out
- gate state for next-phase forum APIs

Not included yet:

- post create API
- comment API
- server-side session verification with Cloudflare Pages Functions

## Forum Phase 3.1 API skeleton

Cloudflare Pages Functions route:

- `GET /api/forum/posts?circle=<slug>&limit=<n>`
- `POST /api/forum/posts`

`POST` requirements:

- `Authorization: Bearer <supabase_access_token>`
- JSON body:
  - `circle_slug`
  - `title`
  - `body`
  - `type` (`experience|question|review|dev|news|feedback`)

`POST` behavior in current phase:

- validates user token server-side
- validates payload
- inserts post as `pending`
