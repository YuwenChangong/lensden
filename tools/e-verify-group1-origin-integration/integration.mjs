import { OriginDiagnostic } from './diagnostic.mjs';

// Observation only. No route.continue/fetch, permission list or transport is installed here.
export async function attachOriginDiagnostics({ context, page, actor, appOrigin, supabaseOrigin, staticPaths = [], store, stop, stage } = {}) {
  if (!store?.capture || !store?.receipt || !store?.close) throw Error('PROTECTED_ORIGIN_STORE_REQUIRED');
  const diagnostic = new OriginDiagnostic({ appOrigin, supabaseOrigin, staticPaths, captureOrigin: value => store.capture(value) });
  const rows = [], pending = new Set(); let closing = false, cdpState = 'UNAVAILABLE', fault = null, session;
  const safeFailure = () => { fault ||= 'ORIGIN_DIAGNOSTIC_FAILED'; stop(fault); };
  const onCdp = event => { if (!closing) try { diagnostic.observeCdp(event); } catch { safeFailure(); } };
  const onRequest = request => {
    if (closing || /^(?:about:blank|data:,)$/.test(request.url())) return;
    // The QA portal has its own local handler. This listener covers the application page only.
    try { if (request.frame().page() !== page) return; } catch { /* unavailable/Worker is not silently classified as a page Frame */ }
    const job = diagnostic.observe(request, { page, actor, stage: stage() }).then(row => {
      if (row.originEvidence.status === 'PROTECTED_CAPTURE_FAILED' || row.originEvidence.status === 'PROTECTED_CAPTURE_UNAVAILABLE') {
        fault ||= 'PROTECTED_ORIGIN_CAPTURE_FAILED'; stop(fault);
      }
      rows.push(row);
    }).catch(safeFailure);
    pending.add(job); job.finally(() => pending.delete(job));
  };
  try {
    session = await context.newCDPSession(page);
    session.on('Network.requestWillBeSent', onCdp); await session.send('Network.enable');
    cdpState = 'MAIN_PAGE_SESSION_CANDIDATES_ONLY';
    context.on('request', onRequest);
  } catch {
    await session?.detach().catch(() => {}); diagnostic.dispose(); throw Error('ORIGIN_CDP_ATTACHMENT_FAILED');
  }
  const receipt = () => ({ boundary: 'MONITOR_ONLY', cdpCoverage: cdpState, correlation: 'METHOD_URL_CANDIDATE_NOT_EXACT_ID',
    workerSharedWorkerWebSocketCoverage: 'UNKNOWN_INCOMPLETE', evidenceFault: fault,
    observations: rows.map(row => ({ ...diagnostic.refreshCdp(row), captureProtection: 'CURRENT_USER_DPAPI_OWNER_SYSTEM_DACL' })),
    protectedIndex: store.receipt(), historicalV16Identity: 'UNKNOWN' });
  let finalReceipt;
  return Object.freeze({ receipt: () => finalReceipt ?? receipt(), async flush() { await Promise.all([...pending]); return receipt(); },
    async close() {
      if (closing) return;
      closing = true; context.off('request', onRequest);
      await Promise.all([...pending]);
      finalReceipt = receipt();
      await session.detach().catch(() => {}); await store.close(); diagnostic.dispose();
    } });
}
