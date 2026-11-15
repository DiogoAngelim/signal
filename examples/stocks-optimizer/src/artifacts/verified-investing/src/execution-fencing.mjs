import { OperationalLedger } from './operational-ledger.mjs';
import { VerifiedBinancePorts } from './binance.mjs';
import { PaperPortfolio } from './paper.mjs';
import { check } from './contracts.mjs';

/** Check ownership INSIDE the write transaction and again before committing. */
export class FencedOperationalLedger extends OperationalLedger {
  transaction(fn) {
    return super.transaction(() => {
      if (this.leaseRequired) this.assertLease();
      const result = fn();
      if (this.leaseRequired) this.assertLease();
      return result;
    });
  }
}

/** The last financial side-effect boundary is fenced, including after asynchronous account/order reads. */
export class FencedBinancePorts extends VerifiedBinancePorts {
  constructor(options) {
    check(typeof options.leaseGuard === 'function', 'broker_lease_guard_required');
    super(options); this.leaseGuard = options.leaseGuard;
  }
  async request(path, params = {}, method = 'GET', signed = true, weight = 20) {
    if (method !== 'GET') this.leaseGuard();
    return super.request(path, params, method, signed, weight);
  }
  async order(symbol, clientOrderId) {
    // An unresolved execution must remain recoverable after a process restart, when the local clock cache is empty.
    await this.syncTime();
    return super.order(symbol, clientOrderId);
  }
}

/** A paper high-water mark must survive observations without an intervening trade. */
export class ObservedPaperPortfolio extends PaperPortfolio {
  async snapshot(tenant, profile) {
    const snapshot = await super.snapshot(tenant, profile);
    this.store.transaction(() => {
      const raw = this.raw();
      if (snapshot.flowAdjustedPeakEquity > (raw.flowAdjustedPeakEquity || 0)) {
        const next = { ...raw, flowAdjustedPeakEquity: snapshot.flowAdjustedPeakEquity };
        this.store.db.prepare('UPDATE paper_accounts SET body=? WHERE tenant=?').run(JSON.stringify(next), tenant);
        this.store.append(tenant, 'paper.equity_peak_observed', { peak: next.flowAdjustedPeakEquity });
      }
      snapshot.flowAdjustedPeakEquity = Math.max(snapshot.flowAdjustedPeakEquity, raw.flowAdjustedPeakEquity || 0);
    });
    return snapshot;
  }
}
