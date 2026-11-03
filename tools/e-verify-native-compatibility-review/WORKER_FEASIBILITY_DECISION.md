# Dedicated Worker control: bounded offline exit decision

Status: BLOCKED. No live compatibility fix, authorization Packet, UTC or GO.

The owner approved only offline engineering. The previous 8/8 capability evidence
is reused. Five new focused supervision checks passed as measurements, not as a
claim that the proposed safety requirements passed.

## Actual local Chrome result

Evidence: artifacts/worker-feasibility-1791966406351/WORKER_FEASIBILITY_SAFE.json
and SUPERVISOR_SAFE.json. Real pinned Chrome, separate owned profile/context,
loopback parent and cross-origin child fixture; no vendor script, accounts or keys.
Reject-only loopback proxy, non-loopback DNS disabled, Node guard, native Job.

- Worker target observed with waitingForDebugger=true.
- Worker body execution before/after attachment:0. Never resumed the Worker.
- Target metadata did not establish the registered Challenge Frame owner.
- Worker-target Fetch.enable returned CDP_METHOD_NOT_AVAILABLE. The raw protocol
  error/target identifiers are not written to shared evidence.
- Initial local Worker script GET count1; no registered-frame admission proof
  for that request in this setup. Do not assume page interception covers it.
- Profile removed; native Job closed, child reaped; no official SDK executed,
  Production requests0, third-party live requests0, frozen executor unchanged.

These results contradict the required proof of worker identity and pre-dispatch
egress supervision on this minimal CDP route. They do not prove that every possible
browser/network architecture is incapable of controlling workers. Do not add a
new proxy/TLS interception system or silently resume the paused Worker.

## Exit decision

Stop this candidate implementation. Do not expose Dedicated Worker to the live
diagnostic under old controls. Other APIs and old executors remain unchanged.
The observed Cloudflare unsupported-browser cause is still UNKNOWN. Native
constructor/Worker operation in local fixtures is not vendor compatibility proof.

Only alternative: STANDARD_NATIVE_MANUAL_ALTERNATIVE_NOT_AUTHORIZED.md.
It deliberately proposes a different, monitor-only Worker boundary, not a claimed
hard safety fix. Requires separate owner acceptance of the changed contract before
implementation/live authorization. No automatic new instance/Claim/GO.
