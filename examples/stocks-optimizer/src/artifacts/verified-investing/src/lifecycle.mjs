import { check, integer, fingerprint, units, tradeNotional, feeAmount, validateQuote } from './contracts.mjs';
import { createInvestingService, VerifiedDataClient } from './service.mjs';
import { executeApprovedPlan } from './evidence.mjs';
import { reconcileExecution } from './operational-ledger.mjs';

/** Identity binding and request coalescing are also enforced at the consumer boundary. */
export class BoundDataClient extends VerifiedDataClient {
  constructor(options) { super(options); this.inflight = new Map(); this.quotes = new Map(); }
  async request(params) {
    const data = await super.request(params);
    check(data.symbol === params.symbol, 'data_symbol_mismatch');
    if (params.kind !== 'quote') {
      check(data.interval === params.interval, 'data_interval_mismatch');
      check(data.bars.length === Number(params.bars), 'data_bar_count_mismatch');
    }
    return data;
  }
  async single(key, load) {
    if (this.inflight.has(key)) return structuredClone(await this.inflight.get(key));
    check(this.inflight.size < 32, 'data_queue_capacity');
    const promise = Promise.resolve().then(load); this.inflight.set(key, promise);
    try { return structuredClone(await promise); } finally { this.inflight.delete(key); }
  }
  async history(symbol, interval, bars = 2500) {
    return this.single(`h:${symbol}:${interval}:${bars}`, async () => structuredClone(await super.history(symbol, interval, bars)));
  }
  async quote(symbol) {
    return this.single(`q:${symbol}`, async () => {
      const old = this.quotes.get(symbol);
      if (old && old.expires > this.now()) return validateQuote(old.value, { now: this.now(), symbol, expectedRelease: this.expectedRelease });
      const value = await super.quote(symbol);
      if (this.quotes.size >= 64) this.quotes.delete(this.quotes.keys().next().value);
      this.quotes.set(symbol, { value: structuredClone(value), expires: Math.min(this.now() + 1000, value.expiresAt) });
      return value;
    });
  }
}

export function createOperationalService(ports) {
  const { store, mode = 'paper', accountPort, permissionPort, brokerPort, now = Date.now } = ports;
  const base = createInvestingService(ports), active = new Set(); let accepting = true;
  const track = async operation => {
    check(accepting, 'service_draining'); store.assertLease();
    const pending = Promise.resolve().then(operation); active.add(pending);
    try { return await pending; } finally { active.delete(pending); }
  };
  async function execute(tenant, key) {
    check(tenant === store.owner, 'account_owner_mismatch');
    const prior = store.execution(tenant, key);
    // Authenticated retries report the existing result even after expiry or balance changes.
    if (prior) return { duplicate: true, ...prior };
    const plan = store.get(tenant, 'plan', key); check(plan, 'unknown_plan');
    const profile = store.currentProfile(tenant);
    check(profile && fingerprint(profile) === plan.riskProfileHash, 'risk_profile_changed');
    const account = await accountPort.snapshot(tenant, profile);
    check(fingerprint({ ...account, syncedAt: 0 }) === plan.accountHash, 'account_changed');
    const permissions = permissionPort ? await permissionPort.permissions(tenant, plan) : null;
    const guardedBroker = mode === 'paper' ? brokerPort : {
      async submitLimit(order) {
        store.assertLease();
        check(fingerprint(store.currentProfile(tenant)) === plan.riskProfileHash, 'risk_profile_changed');
        const current = await permissionPort.permissions(tenant, plan);
        check(current.enabled === true && current.tenant === tenant && current.mode === mode && current.expiresAt > now(), 'trading_permission_required');
        check(current.killSwitch === false && current.securityReviewCleared === true, 'operational_clearance_required');
        check(current.profileHash === plan.riskProfileHash && current.allowedSymbols.includes(order.symbol), 'execution_scope_changed');
        check(units(tradeNotional(order.quantity, order.limitPrice)) <= units(current.maxBatchNotional), 'notional_budget_exceeded');
        if (current.feeBps !== undefined) check(units(order.estimatedFee) >= units(feeAmount(order.notional, current.feeBps)), 'fee_ceiling_changed');
        const found = await brokerPort.submitLimit(order);
        check(found.symbol === order.symbol && found.clientOrderId === order.clientOrderId && found.side === order.action, 'broker_order_identity_mismatch');
        check(units(found.origQty) === units(order.quantity) && units(found.executedQty) <= units(found.origQty), 'broker_fill_quantity_mismatch');
        if (found.status === 'FILLED') check(units(found.executedQty) === units(found.origQty), 'inconsistent_filled_order');
        return found;
      },
    };
    return executeApprovedPlan({ tenant, plan, strategyHashes: plan.strategyHashes, store, permissions,
      broker: guardedBroker, mode, now: now() });
  }
  const service = { ...base };
  for (const name of ['research', 'signals', 'plan']) service[name] = (...args) => track(() => base[name](...args));
  service.execute = (...args) => track(() => execute(...args));
  service.saveProfile = (...args) => { check(accepting, 'service_draining'); store.assertLease(); return base.saveProfile(...args); };
  service.reconcile = (tenant, key) => track(() => reconcileExecution({ store, tenant, key, broker: brokerPort,
    accountPort, profile: store.currentProfile(tenant) }));
  service.operations = tenant => ({ accepting, activeRequests: active.size, unresolved: store.unresolved(tenant),
    durableLedger: store.durable, accountMode: mode, realMoneyEnabledByThisResponse: false });
  service.drain = async () => { accepting = false; await Promise.allSettled([...active]); };
  return service;
}

/** Permission is reloaded every cycle; stop() waits for an in-flight cycle before closing storage. */
export function managedAutonomy({ service, tenant, strategyHashes, permissionSource, intervalMs = 60000,
  now = Date.now, timers = globalThis, onResult = () => {}, onError = () => {} }) {
  integer(intervalMs, 'worker_interval', 1000, 86400000);
  check(typeof permissionSource === 'function', 'autonomy_permission_source_required');
  let stopped = false, timer = null, pending = null;
  const permission = () => { const p = permissionSource(); check(p?.enabled === true && Number.isFinite(p.expiresAt) && p.expiresAt > now(), 'autonomy_permission_revoked'); return p; };
  const tick = () => {
    if (stopped || pending) return;
    pending = (async () => {
      try {
        permission(); const plan = await service.plan(tenant, strategyHashes);
        if (stopped) return;
        permission(); const result = plan.planHash ? await service.execute(tenant, plan.planHash) : plan;
        onResult(result);
        if (['unknown', 'submitted', 'reserved'].includes(result.status)) stopped = true;
      } catch (error) { stopped = true; onError(error.code || 'autonomy_failed'); }
      finally { pending = null; if (!stopped) timer = timers.setTimeout(tick, intervalMs); }
    })();
  };
  permission(); timer = timers.setTimeout(tick, 0);
  return { async stop() { stopped = true; if (timer !== null) timers.clearTimeout(timer); if (pending) await pending; },
    get running() { return !stopped; } };
}
