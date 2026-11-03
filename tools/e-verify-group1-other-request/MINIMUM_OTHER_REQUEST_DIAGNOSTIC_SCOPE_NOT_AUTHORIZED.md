# Minimum missing-path observation: owner scope review only

NOT_AUTHORIZED. No active authorization ID, UTC window, Claim or GO.
This scope is NOT yet an implemented/frozen Production entry. It cannot be
executed with v11 or any historical authorization. Full GROUP_1 stays BLOCKED.

## Exact purpose

Identify the first application LOGIN_A GET reported as `other` before it is
sent; distinguish a reviewed HTML document icon, an unknown application path,
an origin/protocol/frame mismatch and a privacy-blocked path. No authentication
or RLS test is included. Do not infer historical identity from a local favicon.

## Proposed finite requests and identity

Maximum3 actual Production GETs, no retries or followed redirects:

1. One authenticated Provider GET to
   `https://api.cloudflare.com/client/v4/accounts/dcb374166b39234a499985145c075f50/workers/scripts/openglasshub/deployments`.
   Require the current Production version
   `b2b62ec9-bb8d-4159-ac99-08fca5740134` at100% and recovery151 at0%.
   Reuse the reviewed strict Provider JSON/Set-Cookie handling. No other API,
   OAuth refresh, enumeration or metadata GET is permitted.
2. One anonymous GET to
   `https://openglasshub.ogh.workers.dev/login/?next=%2Fproducts%2F`.
   Require200, expected HTML content type, original no-response-Cookie rules
   and the exact retained login HTML hash. Use its bytes for browser observation.
3. Only after a successful safe observation and clean stop, one identical
   Deployment GET confirming the same Deployment/version/traffic. If the first
   gate anomaly occurs, stop immediately; do not issue this third request.

The23 already verified login scripts/styles are served from protected retained
bytes, with exact path/SHA256/type validation through the existing controlled
transport. No static asset is downloaded again. No fresh unknown resource is
downloaded. No third-party Production request, including Turnstile, is allowed.
If an uncached resource or challenge request arises before the intended `other`
event, reject it before dispatch and stop; do not fabricate a Production
challenge response to continue.

## Proposed budgets and deadlines

- Actual Production GET max3 (Deployment max2, HTML max1); zero Auth/RLS,
  credential entry, mail, mutation, upload, Provider writes or database access.
- Browser admission-attempt cap32 including rejected/local-cached requests,
  backed by the original650 global and unchanged class caps. This is a tighter
  diagnostic boundary, NOT an increase or replacement of owner budgets.
- Hard300s; work240s; cleanup reserve60s. Complete within a fresh approved UTC
  window with at least310s at start; no fixed waiting period. Local OAuth must
  satisfy the existing300s read-only coverage rule (>360s), correct default
  credential source and required scopes, without a Provider identity probe.
- Preserve existing bounded HTML/response/header limits; do not increase them.
  Freeze exact numeric values from the reviewed reader in the future entry.
  Byte-read limits are NOT a strict network-traffic or platform-billing limit.
- Strict USD0: only existing owner-attested Free Workers/static, Supabase and
  Turnstile policies apply; no paid add-on, overage acceptance or auto upgrade.
  If any newly relevant billing path is not proven Free, stop before dispatch.

## Identity capture and privacy

Observe the first target before the icon-exclusion branch and stop without
transport dispatch; this narrower diagnostic does not continue the login flow.
The first target request remains blocked before transport. Exact public
pathname may enter a safe receipt ONLY if it is a strictly validated, same-origin
public HTML reference with no sensitive envelope. Unknown `other` uses an
owner+SYSTEM-only protected encrypted pathname association, reviewed locally;
the ordinary receipt contains only keyed evidence ID, cipher reference/hash,
stage/actor/method/source/protocol/frame/type, matching status and rejection rule.
Never persist query, fragment, Cookie, Authorization, Session, body, frame URL,
credentials or mail identifiers. Sensitive paths remain PRIVACY_BLOCKED and stop.
Initiator availability must be stated, not invented.

## Side effects, stop and owner decisions

Production GETs can create access/security/rate-limit records that cannot be
fully erased. No claim of zero log effects. Accepting those records never
authorizes paid usage. No real account action or test object is involved.
Stop on the first anomaly, identity drift, unexpected response, privacy failure,
budget/deadline breach or ambiguous state. Drain browser/Job resources; preserve
the real safe receipt. No retry, reconnect-for-retry, whitelist expansion or
automatic cleanup mutation. Record if post-Deployment was not reached.

Owner must independently approve this narrowed scope and retained-log/privacy
boundary, USD0 Free-only rule, Catalog hold and post-Hardening recovery boundary,
and availability throughout a fresh exact window. Version151 is never a default
post-Hardening recovery target. GROUP_2/3 and Public Beta remain NOT_AUTHORIZED.
No human gate or time is pre-approved here. No GO command is issued for this
unfrozen proposal. Only after an independently frozen entry and new complete
approval may a separate diagnostic GO be defined; never reuse v11.

After identification: prove source/use offline and fix an exact binding if
legitimate, or keep the path blocked if outside scope. Then, and only then,
prepare a fresh complete GROUP_1 package. Do not repeat asset/name diagnostics.
