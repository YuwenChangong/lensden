# Receipt v2 and historical compatibility

The runtime validator is `readReceipt()` in receipts.mjs; no new Schema library.
Only `isolated-turnstile-safe-v2` child receipts use these noncolliding fields:

| Field | Values / purpose |
| --- | --- |
| executionStatus | BLOCKED, SDK_RESPONSE_OBSERVED, OBSERVED_ISOLATED_VENDOR_CHAIN |
| failureStage | SDK_LOAD, WIDGET_INIT, CLEANUP or null |
| failureCode | bounded uppercase code or null |
| stageResults | renderStarted/renderReturned/callback booleans |
| cleanupStatus | PASS or FAILED, independent of execution failure |
| sdkResponseObserved | whether response headers/response were actually observed |
| responses | bounded safe response metadata, no raw URL/header/body values |

Each response has an opaque numeric sequence, HTTP_STATUS_CODE(integer100..599
or null), HTTP_STATUS_CLASS(1xx..5xx or UNKNOWN), RESPONSE_HEADERS_OBSERVED,
LOCATION_HEADER_PRESENT(boolean or null), LOCATION_TARGET_ORIGIN_CLASS,
LOCATION_TARGET_SAME_ALLOWED_HOST(boolean or null), REDIRECT_STATUS_TRIGGERED,
LOCATION_HEADER_TRIGGERED and SDK_RESPONSE_REJECTION_REASON. A null differs from
false: network failure before headers has UNKNOWN status/header presence. Headers
observed before a body failure retain their facts; body/transport rejection is
recorded separately. Relative Location is classified against the exact SDK URL.
Origin classes contain no raw hostname/path/query/fragment/credentials. Even
SAME_ALLOWED_ORIGIN does NOT authorize following Location.

The new parent uses finalizeReceipt(), not child.status. Native containment and
cleanup must independently pass. Its success label SDK_RESPONSE_DIAGNOSTIC_COMPLETE
means only a nonrejected SDK response observed, never real SDK execution/init.
An explained302 is still BLOCKED, but provides new diagnostic evidence.

Historical v1 receipts are read without modification: firstFailure, phase booleans,
registered frames and cleanup determine the result; a status object is NOT an
aggregate success label. No missing historical HTTP/Location fields are invented.
Historical B1 is BLOCKED, SDK_LOAD, REDIRECT_OR_LOCATION, cleanup PASS, response
metadata NOT_RETAINED. Historical raw bytes and existing consumers remain frozen;
all NEW child/parent consumers use v2 explicitly.
