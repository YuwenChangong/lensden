import { Evidence } from '../e-verify-native-manual/evidence.mjs';
export class Observation extends Evidence {
  #started = false;
  event(name) {
    if (name === 'START_CLICKED') {
      if (this.#started) this.stop('OWNER_START_REPLAY');
      this.#started = true; return;
    }
    super.event(name);
  }
  receipt() {
    const result = super.receipt();
    return { ...result, outcome: result.outcome === 'ISOLATED_OBSERVATION_COMPLETE' && !this.#started ? 'INCOMPLETE' : result.outcome,
      format: 'standard-chrome-manual-safe-v1', startClicked: this.#started,
      networkBoundary: 'MONITOR_ONLY', workerNetworkBoundary: 'MONITOR_ONLY', hardGlobalNetworkLimit: false,
      allNetworkRequestsObservable: false, capabilitiesSpoofed: false };
  }
}
