# R2 Ticket Offline Root Cause and Repair

Scope: one bounded offline investigation plus affected post-fix regression.
No provider requests,real PUT,upload,delete,Production operation or old GO reuse.

## Proven Chain

1. Existing five R2 variables load from checkout-root .env.r2-test.local into
   server-only bindings. They are not sent to Astro client/build variables.
2. Pre-fix run e145197b5bcc: browser ticket request HTTP500; direct same Worker
   POST HTTP500. QA assertion then route.abort converted the error response into
   Failed-to-fetch. Client fallback predicate at CreatePostForm.tsx:570-575
   matched; that behavior explains the previous local Storage fallback.
3. Pre-fix generated signer invoked inside local Workerd with synthetic keys:
   TypeError: emitWarningIfUnsupportedVersion is not a function.
   Stack: getRuntimeConfig -> new S3Client -> createR2Client -> signR2PutUrl.
   Original bundled Node S3 runtime called browser AWS core's node-only Symbol.
   Outbound attempts0. This does not prove a deployed Production artifact defect.
4. Build-only exact resolver now selects existing S3 runtimeConfig.browser.js
   only for S3Client.js's runtimeConfig import. No source auth/RLS change,SDK
   replacement or fallback change. Generic image/other SDK imports untouched.
5. QA preserves non200 status/body,not an invented transport error. Successful
   tickets still need exact one-object validation before release.
6. Fixed local run e4467608a523: browser HTTP200,COMPLETE; direct Worker HTTP200;
   four ticket fields present and exact target accepted. R2 attempts0. This is
   genuine local signing evidence,not a real-cloud upload/read/delete result.

## Targeted Evidence

- Seven distinct offline checks PASS. First invocation6 PASS/1 incorrect image
  test assertion; corrected only that assertion to follow the smaller-original
  optimization,then reran only that check/PASS. No image business code changed.
- Real rebuilt Workerd SDK signer:HTTPS,bucket/path,SigV4 signature shape,900s
  expiry,zero outgoing requests. All fixture credentials synthetic.
- Real Chrome runs actual extracted source upload function:valid ticket reaches
  exactly one local Mock PUT; server500 does not silently become success;
  transport abort remains eligible for the existing fallback. Mock bytes are not
  a valid-video fixture claim. No remote URL is followed.
- Interceptor HTTP400/401/403/500 preserved;valid200 validation precedes release;
  invalid target denied. Real browser image and thumbnail optimization PASS;
  historical Supabase Storage integration reused,not rerun or called real R2.
- Both actual local runs used temporary A/B/ADMIN and isolated contexts. All
  accounts/rows/Storage data/containers/volumes/DPAPI state/certificates cleaned.
  Browser and Worker disposed; active pointer/listeners absent.
- Safe report/config scan checks actual R2 key/secret values absent. Reusable
  protected ignored R2 configuration retained. Original failure receipts intact.

## Next Independent Approval

Offline ticket path READY_FOR_OWNER_APPROVAL;real R2 upload/playback/Range/delete
NOT_RUN. No remaining30-request allowance is reused. Obtain a new bounded bucket
use approval before any real request. Prior2028-byte MP4 bytes were ephemeral;
only its hash/length were retained. Reuse the known generator,not an invented
claim of byte-for-byte retention;check the fresh one-object <=64KiB fixture.

UI03 stays BLOCKED,Catalog ACTIVE,Public Beta NOT_AUTHORIZED. No Production
request/write,deployment,push,cloud resource or credential creation.
