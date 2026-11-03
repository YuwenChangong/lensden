# Reports Local HTTP500 Exact Stack

2026-10-16, source999d8c4b. Scoped evidence; the unique progress baseline remains
docs/ops/PUBLIC_BETA_CURRENT_STATE.md. No Production/third-party/R2 request.

## Two Bounded Reproductions

1. `9d1882f5dec1`: unchanged real guarded local build/55-migration owned Supabase,
   four login/context prerequisites, B-only GET /admin/reports/. HTTP200, actual
   forbidden UI, no administrator toolbar. This is not a claimed repair.
2. `6245ffd16cfe`: one permitted additional reproduction with original minimal
   setup/prefix: disposable report fixture, A HTML200/forbidden UI plus list GET403
   and action POST403, then B GET /admin/reports/. HTTP500. Four prerequisites
   PASS; no further browser reproduction or broad regression.

## Captured Exception

The actual HTTP500 body is182 bytes of plain text, not an Astro HTML error page:

```text
Error: Network connection lost.
    at async Object.fetch (file:///<repo>/node_modules/miniflare/dist/src/workers/core/entry.worker.js:4733:22)
```

Installed `entry.worker.js` source (unchanged):

```javascript
// line4733
let response = await service.fetch(request);
// lines4735-4736
} catch (e) {
  return new Response(e?.stack ?? String(e), { status: 500 });
}
```

Source SHA256:
255a9fc3f475298e4adfeb5260b0e859df33b3c129e14d4b6b05ccee9f6c2cde

Installed Miniflare5.20260820.0-alpha, Wrangler4.125.0. No dependency changes;
version alone does not establish causation. The stack is authentic and identifies
the service dispatch await and500 conversion. It does NOT include a downstream
native disconnect reason, an application stack or evidence of benign cancellation.
It cannot prove that Astro was never entered, that RLS failed, or that only the
outer proxy is faulty. ROOT_CAUSE=UNKNOWN; FIX=BLOCKED.

Existing runtimeError events and a reversible local entry logger hook expose no
deeper exception. The core catch returns a Response without raising through the
pretty-error/uncaught handlers, explaining the missing higher-level callback.
The temporary hook/listener was removed; no SDK/CDP/network architecture added.

## Request Comparison and Limits

Entry: existing unstable_startWorker loopback HTTPS server4328, guarded Astro
Cloudflare build; remote/watch/liveReload/inspector disabled. Outbound is limited
to this owned local Supabase. Browser contexts and local test-only CAPTCHA unchanged.

Both browser and direct input: GET, HTTPS, authority127.0.0.1:4328, pathname
/admin/reports/, same running Worker/configuration. Browser redirect chain has
one pathname only. Browser header names observed:

accept, accept-language, cookie, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform,
upgrade-insecure-requests, user-agent.

Cookie is present, Authorization absent; no values are collected. Direct Worker
input explicitly supplies no headers/Cookie/Authorization and receives200. The
browser identity was independently verified in its isolated context; HTML requests
do not send its localStorage session as a bearer header. Direct call is not an
equivalent authenticated browser navigation or a replacement PASS. Effective
internally forwarded headers/Host and downstream request context are NOT fully
observed, so no Cookie/User-Agent/locale/header cause is asserted.

Existing contract: public nonprivileged shell200 with client forbidden UI and
protected admin API403 for ordinary users. There is no own-reports product page.
The reproduced500 is not the expected denial. No permission widening is justified.

## Outcome and Safety

- No application/API/schema/RLS/Auth/config or dependency modification.
- No fix regression claimed: no root proven and no product fix to validate.
- Existing ADMIN access/actions, normal reporter UI201, report-row privacy and
  eight5003-5014ms idle intervals with0 extra reads remain source-applicable and
  reused. No23 business,16 RLS or complete reports-suite rerun.
- UI03 FAIL; GROUP1 local10/14; real R2 BLOCKED; Production parity UNKNOWN.
- Both exact owned databases/volumes/fixtures/actors/encrypted credentials and
  test processes cleaned; active pointer and listener ports absent.
- Production requests/writes/deploy/push0, third-party live0, USD0, Catalog ACTIVE,
  Public Beta not authorized. Historical receipts unchanged.

Exact missing observation: why the downstream workerd service disconnects below
the captured service.fetch boundary. The two-reproduction cap is exhausted; no
third browser attempt, guessed SSR/permission patch, dependency upgrade or alternate
entry is authorized by this evidence. Keep the issue BLOCKED at that boundary.
