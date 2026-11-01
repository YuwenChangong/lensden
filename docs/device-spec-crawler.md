# Device Spec Crawler

`scripts/curate-device-specs.mjs` is a reusable CLI for collecting **official public device facts** for `/devices/`.

It is designed for:

- official product pages
- structured specs and factual fields
- repeatable dry-runs
- JSON candidate output
- human review before device-page updates

It is **not** for:

- copying long marketing copy
- copying media/news article full text
- downloading or rehosting official product images
- bypassing `robots.txt`

## What it collects

The crawler focuses on structured facts only:

- brand
- model name
- product URL
- official source URL
- last checked time
- display / optics / hardware / battery / physical / compatibility / market fields
- `official_image_url` as a **reference candidate only**
- `confidence`
- `missing_fields`
- a short original `short_description`

Unknown fields remain `unknown`.

## Safety rules

- Only crawl public official product pages
- Respect `robots.txt`
- Skip disallowed paths
- Use delay between requests
- No high-frequency parallel scraping
- No source-image download
- No automatic publish

Default User-Agent:

`OpenGlassHubDeviceSpecBot/0.1 (+https://openglasshub.pages.dev)`

## Source config

Source config lives in:

`docs/device-sources.json`

Example:

```json
[
  {
    "brand": "XREAL",
    "name": "XREAL One",
    "slug": "xreal-one",
    "source": "official",
    "url": "https://us.shop.xreal.com/products/xreal-one"
  }
]
```

Required fields:

- `brand`
- `name`
- `url`

Optional fields:

- `slug`
- `source`

If a URL is not confirmed, do not invent it. Add it later after manual confirmation.

## Commands

Dry-run only:

```bash
node scripts/curate-device-specs.mjs --dry-run
```

Dry-run with source filter:

```bash
node scripts/curate-device-specs.mjs --dry-run --source xreal --limit 5
```

Dry-run with JSON export:

```bash
node scripts/curate-device-specs.mjs --dry-run --input docs/device-sources.json --output device-candidates.json
```

Write a reviewed candidate JSON file:

```bash
node scripts/curate-device-specs.mjs --commit --input docs/device-sources.json
node scripts/curate-device-specs.mjs --dry-run --input docs/device-sources.json --draft-dir data/device-mdx-drafts
```

## Flags

- `--dry-run`
- `--commit`
- `--input`
- `--output`
- `--draft-dir`
- `--source`
- `--limit`
- `--verbose`
- `--use-source-image`
- `--delay-ms`

Defaults:

- dry-run: `true`
- delay-ms: `1200`
- use-source-image: `false`
- no image downloading
- no auto publish

## Output

Dry-run prints:

- scanned count
- skipped robots count
- parsed count
- failed count
- each candidate summary

JSON output shape:

```json
{
  "generated_at": "2026-06-13T00:00:00.000Z",
  "items": [],
  "skipped": [],
  "errors": []
}
```

Each item includes:

- top-level metadata
- `specs`
- `short_description`
- `official_image_url`
- `confidence`
- `missing_fields`

## Existing project structure

Current `/devices/` pages are authored as content docs in:

`src/content/docs/devices/`

This crawler does **not** overwrite those files.

Current implementation writes structured review candidates as JSON instead:

- default commit path: `src/data/device-spec-candidates.json`
- ad hoc export path: whatever you pass to `--output`

It can also generate MDX review drafts:

- example draft dir: `data/device-mdx-drafts/`

These drafts are meant for manual review before moving any content into:

- `src/content/docs/devices/`

That keeps the pipeline safe:

1. crawl official facts
2. inspect JSON candidates
3. optionally inspect generated MDX drafts
4. manually update device docs

## Image policy

By default:

- no image download
- no storage upload
- no copying official images as owned assets

The crawler only records `official_image_url` as a **candidate reference URL**.

If you pass `--use-source-image`, the output marks:

- `use_source_image: true`

But it still does **not** download or upload the image.

Official images usually remain copyrighted. Prefer press/media kits or separately licensed assets before production use.

## Description policy

`short_description` is generated from factual signals.

It should:

- stay short
- avoid hype
- avoid unverifiable “best / revolutionary / 全球第一 / 最强”
- avoid copying the source site’s marketing voice

## Parsing strategy

Priority order:

1. JSON-LD / `schema.org` Product
2. meta / OpenGraph
3. structured tables
4. labeled spec lines
5. conservative text pattern fallback

The crawler intentionally does **not** preserve full product-page layout or long-form promotional copy.

## Confidence and missing fields

`confidence` is a simple signal based on:

- how many fields were extracted
- whether Product JSON-LD exists
- whether spec tables exist

It is not a guarantee of truth.

`missing_fields` tells you which fields still need manual verification.

## When robots or terms block access

If `robots.txt` disallows the path:

- the crawler skips it
- the result is logged in `skipped`

It does not try to bypass that restriction.

## How to add a new brand

1. Confirm the official public product URL
2. Add a new object to `docs/device-sources.json`
3. Run `--dry-run`
4. Inspect `missing_fields`, `confidence`, and `official_image_url`
5. Review manually before updating `/devices/`

## Manual review checklist

Before using output in production device docs:

- verify official URL still matches the intended product
- verify factual fields against the current page
- remove or correct weakly inferred values
- decide whether an official image may be used
- rewrite the device doc in Lensden’s own voice
