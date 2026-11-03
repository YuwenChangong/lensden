# Lensden — Publish researched user-experience news and finish 67-article target

## Exact state

- Existing production: https://lensden.net/; main at last user-confirmed SHA `8cf38f2cadea415f4328642202e7772bb9f88dc5`.
- Cloudflare Worker and Pages automatic builds are **disabled**. Do not infer that a Git push equals deployment.
- This package contains **7 complete news drafts**, **7 original SVG editorial illustrations**, **67 researched topic entries** (of which **60 are unfinished briefs**) and a traceable source ledger.
- Nothing in this package has been deployed or published. Do not report otherwise.

## Owner request

The owner asked for 67 medium-length user-experience articles on Lensden's **News** page and substantial organic promotion. Follow the author's existing zero-infrastructure-charge, safe-publication constraints. Do not create a standalone compatibility finder.

## Execute

1. Start with the 7 complete Markdown articles in `articles/`. Compare them with existing published news/guides to avoid duplicate content. Review model/firmware context and date. Do not claim Lensden hands-on tests. Where factual edits are required, correct directly using manufacturer documentation.
2. Adapt each article to the existing `news_articles` schema and authenticated news publishing workflow; do **not** circumvent staff MFA or database RLS. `content` supports headings, paragraphs, bulleted lists, `[text](https://...)` and `![alt](https://...)` via `src/lib/news-content.ts`. Preserve source name, source URL, published_at actual time, title, summary and category. Byline should match existing editorial conventions and authorization (do not invent named authors).
3. Ship 7 unique original SVG graphics to a first-party static route (e.g. `/news-images/`) through the existing free manual build/deploy flow and use real HTTPS URLs for the image blocks/cover. Label the graphics as conceptual, not product photography; do not hotlink/re-upload Bilibili, YouTube, Reddit thumbnails without reuse rights.
4. Publish the 7 articles in `/news/` with a single bounded release/normal admin workflow, verifying public HTTP status, editorial text, Canonical, sitemap eligibility and no duplicate slugs. Only verified paths go live; if staff MFA is needed, use the existing authenticated flow rather than changing permissions.
5. Use the remaining 60 topic briefs as commissioning targets, not finished copy. For EACH, find at least one new model-specific first-hand discussion or professional test, verify original publication date and model context, research current manufacturer docs, write a distinct 350–650 word English report with factual limitations and proper links; add a licensed/original useful graphic where possible.
6. Avoid 60 template paragraphs or superficial rewording of existing content. Merge or replace overlapping briefs when there is insufficient new evidence, while preserving the 67-piece target by finding genuinely different user questions.
7. Release accepted articles through normal News admin publishing with measured batches, **without treating publication as proof of indexing**. Maintain original editorial dates, accurate update dates and direct internal links to relevant devices/Compare/guides.
8. For promotion, prepare/publish only non-spam, truthful, community-rule-compliant contributions: GitHub README, individual relevant Reddit/Bilibili/YouTube discussions, XR tech author outreach. Do not fabricate discussion, comments, backlinks, votes or AI citations; do not auto-post 67 links or bulk-message creators.
9. Existing Google Search Console and Bing sitemap registration are already established; don't repeat or request manual indexing for each news article. Confirm new news URLs appear automatically in sitemap and crawler rules allow Googlebot, Bingbot and OAI-SearchBot where intended. Search ranking/AI citations cannot be guaranteed.
10. Preserve zero additional infrastructure charges. No paid service/API, no hosted build fallback, no unapproved R2 object usage or schema migration. No repeated general release audits. Keep production functional, rollback only on a verified regression.

## Close-out

Report exact counts (`complete`, `published`, `blocked`), per-article live URLs and cited source record, graphics URL where present, production version and actual SEO indexing status (NOT_VERIFIED unless console evidence exists). Don't convert unpublished drafts into public success claims.
