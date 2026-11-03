# Lensden user-problem research — 2026-11-03

## Exact status

- 67 individually titled research targets in `67-question-research-backlog.csv`.
- **7 complete English news article drafts**, including links to verifiable community reports.
- **7 original editable SVG conceptual illustrations plus 7 PNG versions**; not photographs of the devices.
- **60 remaining targets are briefs, not written articles**. None are published.

## Publishing to existing Lensden architecture

The current `/news/[slug]/` route reads `public.news_articles` in Supabase. The `content` field supports Markdown-style paragraphs, # headings, bullet points, links and `![alt](absolute HTTPS image URL)` lines through `src/lib/news-content.ts`. Sources have `source_name` and `source_url`; title, summary, cover_image_url, category, status, published_at are part of the table.

Before using any image in production, deploy the SVG files to a first-party static media path and replace the image references with the absolute `https://lensden.net/...` URLs. Images are schematic illustrations and must be labeled as such. Do not hotlink or reupload video thumbnails without permission.

Do not claim that a complaint proves a systematic fault. Do not invent first-hand tests or quotes. Confirm post/video access and manufacturer specs again on actual publication day. Use the news admin publishing workflow (MFA) rather than bypassing it with SQL owner credentials.

Because 67 stories all at once would largely concern overlapping product issues, further pieces should be written after adding more distinct primary experiences, and the editor should remove duplicative drafts before publication. Google and AI search discovery cannot be guaranteed even when site XML/canonicals work.

`news-import-ready.json` maps the seven full articles to the existing Supabase `news_articles` columns. All import records intentionally remain `status=draft` with null `published_at` until published through the existing authenticated admin flow. The `cover_image_url` requires hosting the generated PNGs at the first-party URLs before publication.
