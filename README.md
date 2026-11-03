# Lensden

Lensden is an independent AR/AI glasses database, comparison resource and community, developed and maintained by Jayden. It separates manufacturer specifications, compatibility conditions and community observations rather than presenting them as interchangeable evidence.

Website: [Lensden](https://lensden.net/) · [Device library and comparison](https://lensden.net/products/) · [Guides](https://lensden.net/guides/) · [About](https://lensden.net/about/)

Built with Astro + Starlight, Supabase and Cloudflare Workers. Product inclusion does not imply manufacturer endorsement or Lensden laboratory or hands-on testing. Corrections should identify the exact model, affected field and supporting source.

Repository: [Lensden](https://github.com/YuwenChangong/lensden)

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
