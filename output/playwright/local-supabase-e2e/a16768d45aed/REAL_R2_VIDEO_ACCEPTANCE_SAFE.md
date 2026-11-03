# Isolated R2 Video Acceptance

Result:PASS for this newly owner-approved,one-object local-application plus real
test-bucket integration. Not Production parity,full Group1 or Public Beta GO.

Run:a16768d45aed. Code:b8858ec4. Existing runner unmodified during this attempt.

| Check | Actual evidence |
| --- | --- |
| Isolated identities | Fresh local Supabase55 migrations;A/B/ADMIN UI login and separate contexts4/4 PASS |
| Video | Fresh2028-byte H.264 MP4,avc1.42001E,160x90,synthetic canvas |
| Bucket access | Signed HEAD200 |
| CORS | OPTIONS204;exact local Origin,PUT and content-type matched |
| Ticket | Actual local API200,exact owned object target validated |
| Upload | One presigned PUT200;media link201;R2 tmp path,no local Storage fallback |
| Object existence | Signed HEAD200 and content-length2028 |
| Playback | Real Chrome currentTime0.1167,readyState4,decoded160x90,error null |
| Bucket Range | Signed GET206,bytes0-31/2028;32 bytes match fixture |
| Website proxy Range | HTTP200/full bytes/hash match;Range NOT forwarded,not proxy206 PASS |
| Cross-user delete | User B403;no R2 request |
| Normal deletion | Author app delete200,cleanup.ok=true;R2 DELETE204,media rows0 |
| Object absence | Signed HEAD404 after deletion and again after idempotent app delete |
| Idempotency | Repeated app delete succeeds;no second R2 DELETE required |
| Cleanup | Remote exact object removed;local accounts/data/containers/volumes/DPAPI state removed;no app/API/database listeners |

Video SHA256:180b0869efaeec43569d9dae6c2acc9ade569b601fbb4b69ca30e97b1cd6eec0.
Owned object safe reference:a623b713714ebb8a510d. No residual object from this run.
No bucket enumeration or claim that the bucket contains no other objects.

Budget:11/30 actual controlled requests,work8/22,cleanup3/8. HEAD4,OPTIONS1,
PUT1,GET4,DELETE1. Retries0,redirects0,denied0. Not a hard cap on every hidden
browser request or account-wide usage. Exact original safe receipt retained.

Cost:reused delayed October16 account screenshot,not live billing proof or an
absolute zero-additional-charge guarantee. No paid resource created. Credential
provenance owner-confirmed;independent Key identity/exclusive scope UNVERIFIED.

Screenshot captured after detaching video source to end requests;do not use the
empty player screenshot alone as playback evidence. Use telemetry and network
checks in RESULTS_SAFE.json. No secrets,Session or signed URLs persisted here.

UI03 BLOCKED,Catalog ACTIVE,Public Beta NOT_AUTHORIZED. Production reads/writes0,
no push/deploy. Owner next action:disable test Public Development URL.
