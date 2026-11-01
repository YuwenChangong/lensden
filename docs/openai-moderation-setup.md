# OpenAI Moderation Setup

## Default moderation stack:

Lensden default moderation for forum write paths is:

1. Local sensitive lexicon + OpenGlass hard rules
2. OpenAI Moderation API
3. Admin queue / pending review

Only content that passes the active default layers can publish publicly.

## Optional paid enhancement

- OpenAI forum policy classifier
- disabled by default
- only enabled when `OPENAI_FORUM_POLICY_ENABLED=true`
- uses a normal OpenAI model, not the dedicated moderation endpoint
- may consume API credits / cost money

## Source inputs

- `third_party/sensitive-lexicons/konsheng-sensitive-lexicon/`
  - Source: `https://github.com/konsheng/Sensitive-lexicon`
  - License: MIT
- `third_party/sensitive-lexicons/houbb-sensitive-word/`
  - Source: `https://github.com/houbb/sensitive-word`
  - License: Apache-2.0

We import selected plain-text lexicon files only. We do not fetch GitHub at runtime, and we do not depend on Java runtime code.

## Generated files

- `src/data/moderation/sensitive-lexicon.generated.json`
- `src/data/moderation/sensitive-lexicon-manifest.generated.json`

Generated data is rebuilt with:

`node scripts/moderation/import-sensitive-lexicons.mjs`

Do not hand-edit generated files. Edit:

- `src/data/moderation/custom-allowlist.json`
- `src/data/moderation/custom-reviewlist.json`
- `src/data/moderation/custom-denylist.json`

Then regenerate.

## Runtime lexicon storage

To keep the Cloudflare Pages Worker under the 3 MiB bundle limit, the full generated lexicon is no longer imported directly into server code.

- Runtime binding name: `MODERATION_ASSETS`
- Private object key: `moderation/local-sensitive-lexicon.zh.json`
- Loader path: `src/lib/moderation/sensitive-lexicon-loader.server.ts`
- Fallback behavior:
  - first try private R2 object
  - local Node/test environments can read `src/data/moderation/sensitive-lexicon.generated.json`
  - if both fail, use a tiny built-in emergency lexicon for critical terms only

Cloudflare setup:

1. Create or reuse a private R2 bucket for moderation assets.
2. Add a Pages binding named `MODERATION_ASSETS` to that bucket.
3. Upload the generated lexicon object:

`npx wrangler r2 object put <bucket-name>/moderation/local-sensitive-lexicon.zh.json --file src/data/moderation/sensitive-lexicon.generated.json`

Do not put the full lexicon in `public/` and do not expose it to the client bundle.

Critical coverage note:

- Final blocker QA first confirmed `嫖娼` and `卖淫` were present in imported lexicon coverage
- `人口贩卖` was added to `src/data/moderation/custom-denylist.json` after final blocker QA showed that upstream imports did not naturally detect it
- `嫖娼` and `卖淫` are now also pinned in `src/data/moderation/custom-reviewlist.json` so Cloudflare deploys do not depend on the 65k-word upstream runtime dictionary

## Environment variables

- `OPENAI_API_KEY`
- `OPENAI_MODERATION_ENABLED=false`
- `OPENAI_MODERATION_MODEL=omni-moderation-latest`
- `OPENAI_MODERATION_FAIL_MODE=review`
- `MODERATION_PROVIDER_UNAVAILABLE_POLICY=review_all`
- `OPENAI_MODERATION_TIMEOUT_MS=3500`
- `OPENAI_MODERATION_IMAGE_ENABLED=false`
- `OPENAI_POST_IMAGE_MODERATION_ENABLED=false`
- `OPENAI_PROFILE_IMAGE_MODERATION_ENABLED=false`
- `OPENAI_CIRCLE_COVER_MODERATION_ENABLED=false`
- `OPENAI_VIDEO_THUMBNAIL_MODERATION_ENABLED=false`
- `VIDEO_POST_REQUIRES_THUMBNAIL_MODERATION=false`
- `VIDEO_POST_FAIL_MODE=review`
- `OPENAI_MODERATION_LOG_LEVEL=minimal`
- `OPENAI_FORUM_POLICY_ENABLED=false`
- `OPENAI_FORUM_POLICY_MODEL=`
- `OPENAI_FORUM_POLICY_TIMEOUT_MS=4000`
- `OPENAI_FORUM_POLICY_FAIL_MODE=review`

## Behavior

### Local lexicon

- Runs first on posts, comments, profile text, circle text
- Uses imported lexicons plus OpenGlass custom allow/review/reject rules
- Can allow, review, or reject
- Handles off-platform contact, resource-lure spam, suspicious trading, low-quality spam, sexual/violent terms, and political-sensitive categories

### OpenAI Moderation API

- Runs server-side only
- Reviews text and selected image inputs
- Never exposes `OPENAI_API_KEY` to the browser
- Provider errors do not count as OpenAI success
- Provider unavailable does not count as OpenAI success

### OpenAI forum policy classifier

- Runs server-side only
- Uses a normal OpenAI model to classify Lensden policy violations into strict JSON
- Disabled by default
- Provider errors, invalid JSON, missing model, and timeouts fail closed

## Provider unavailable modes

- `review_all`
  - Provider error => `pending_review` or blocked save
  - Provider error never allows public publish
- `local_only_safe`
  - Intended for degraded preview / beta operation when provider returns `429`, `5xx`, timeout, network failure, or a circuit-open state
  - Text content can publish only if the local lexicon says `allow`
  - Degraded allows are marked with local degraded moderation metadata
  - Media / visual moderation does not local-only public allow
- `block_sensitive`
  - Provider error keeps post/comment in review and blocks profile/circle saves

If `MODERATION_PROVIDER_UNAVAILABLE_POLICY` is unset, non-`main` Cloudflare Pages preview branches default to `local_only_safe`, while production-like branches default to `review_all`.

Configuration and implementation errors such as `401`, `403`, missing key, invalid response, parser failures, or missing model are not treated as successful moderation.

## Fail-closed policy

- Invalid classifier JSON never allows public publish
- Missing OpenAI key/model in enabled environments never allows public publish

## Coverage

Text:

- posts
- comments
- profile display name / username / bio payload
- circle name / description

Media:

- post image metadata + signed image moderation when enabled
- post video metadata + thumbnail moderation when enabled
- profile avatar / banner when enabled
- circle cover when enabled

## Video limitation

Full video-stream moderation is not implemented.

Current video review covers:

- post title/body/metadata
- thumbnail or keyframe if available

If thumbnail moderation is required and no thumbnail exists, the post must stay in review.

## 429 handling

- Use retry/backoff and circuit-breaking upstream to avoid request storms
- Log failed OpenAI calls in redacted form only
- Do not expose raw provider errors, raw responses, or category scores to normal users

## False positive handling

1. Confirm whether local lexicon or forum policy classifier triggered
2. Add a narrow allowlist term if the false positive is stable and safe
3. Prefer allowlist or combo-rule tuning over weakening the whole provider
4. Use admin queue for final manual approval

## Rollback

1. Set `OPENAI_MODERATION_ENABLED=false`
2. Set `OPENAI_FORUM_POLICY_ENABLED=false`
3. Keep local moderation active
4. Redeploy
5. Watch admin queue and user reports
