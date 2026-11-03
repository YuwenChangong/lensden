# Isolated bounded Turnstile QA

Owner's local-only B approval implemented without touching Production or the old
GROUP_1 gate. The private 160-field binding is NOT read/imported. New localhost
harness has only the official public dummy Sitekey and fixed api.js URL.

## Actual control path

Chrome context routes every observable HTTP request before dispatch. Node obtains
CDP initiator stacks, joins frame-parent events uniquely with Playwright Frame
objects, pauses newly attached out-of-process iframe targets until Network/Page
observation is installed, and registers response-verified frames. Missing, ambiguous
or unknown lineage stops. The supplier's mutable SDK/script/frame chain grants a
runtime capability: it is expressly NOT an exact complete URL whitelist.

The bootstrap requires a stack rooted in the fixed local harness. Dynamic scripts
are trusted only after accepted original-origin responses. A single root widget
frame needs SDK script creation evidence. Registered frame parser/script traffic
uses the same method/type/origin and budget guards. GET document/script/style/
image/font/fetch/xhr only; POST fetch/xhr only; 'other' never defaults to allowed.

Reservations synchronously charge global650 and combined supplier40 before the
controlled HTTP transport; method and frame ceilings40 are sublimits, not added
budgets. Local harness and denied native proxy attempts count globally. Failed,
cancelled and in-flight reservations never refund. Request-body32KiB and response
body2MiB caps do NOT guarantee a hard bound on wire packets or platform billing.

Chrome's local deny proxy returns403 for HTTP/CONNECT, never opens an opaque
tunnel. DNS mapping/QUIC/RTC policy plus disabled worker/SW/WebTransport/EventSource
and routed WebSockets close reviewed browser paths. Only a closure-held exact-
origin strict-TLS Node transport can fetch vendor bytes. The Node guard denies
general HTTP/TLS/socket/DNS/fetch/worker/child-process exits after browser setup.
This is proof for the pinned reviewed runtime, NOT an OS firewall against a
compromised browser/native executable or an arbitrary malicious Node module.

Native Job Object launches the child only after containment; overall300s includes
startup/cleanup. Work220s plus inside-deadline cleanup reserve60s. Local tests use
shorter limits; a deliberately nonclosing real Chrome descendant is killed/drained.
Normal close aborts controllers, closes context/browser/proxy, discards raw CDP
URL/frame metadata. No screenshots, traces, HAR or raw console/page errors saved.

## Important vendor compatibility limit

The controlled transport freshly retrieves api.js at its exact official HTTPS URL,
does not rewrite bytes or store an SDK cache, and fulfills them at the same browser
URL. This is mediated delivery, not native Chrome TLS. Cloudflare guidance warns
against proxying/self-hosting the SDK. No vendor endorsement or native-equivalence
claim is made. The pending owner contract explicitly discloses this; actual SDK
compatibility has NOT been tested. If native delivery is indispensable, stop rather
than open an uncounted CONNECT tunnel. Cookie/worker needs, mutable vendor behavior,
missing initiators and automation may block completion, with no automatic widening.

## Offline vs live

The synthetic local SDK fixtures deliberately exercise frame creation, child
script GET, POST and callback, budget exhaustion, invalid destinations/methods,
redirects, popup/SW/Worker/WS attempts, Node bypass and hung child cleanup. They
prove safety controls only, NEVER actual Turnstile render/challenge completion.
Future isolated real-SDK observation also cannot pass Production sitekey/account
Auth/RLS or recover the original v11 unknown request identity.

No effective authorization, Claim or GO is generated. Runtime entry requires
fresh owner gates, exact UTC window, frozen files/runtime and independent GO.
Failed preflight closes this independent instance; no automatic repeat. Test
temporary claims are explicitly synthetic and unrelated to Production authorizations.

Strict USD0, Catalog hold, no Siteverify/pre-clearance/account credentials,
GROUP_2/3 and Public Beta unapproved. Applying B to Production GROUP_1 is a
separate decision after isolated live evidence, never implied by this implementation.
