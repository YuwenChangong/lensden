import { openNativeBrowser } from '../e-verify-group1-origin-integration/browser.mjs';
import { openProtectedOrigins } from '../e-verify-group1-origin-integration/private-origin.mjs';
import { pinnedOpen } from '../e-verify-group1-chrome-v15/chrome-identity.mjs';

// Called only by the separately authorized child, before runGroup1 installs Node guard.
export function diagnosticBrowserFactory({ packet, assertions, remaining, browsers,
  open = openNativeBrowser, openStore = openProtectedOrigins, pin = pinnedOpen } = {}) {
  return async options => {
    const store = await openStore({ expiresUTC: new Date(Date.now() + 3600000).toISOString() });
    try {
      const browser = await pin(() => open({ ...options, headless: false, diagnosticStore: store,
        iconPaths: packet.iconPaths, pageAssertions: assertions, workMs: Math.min(remaining, options.workMs) }));
      browsers.push(browser); return browser;
    } catch (error) {
      await store.close({ destroy: true }); throw error;
    }
  };
}
