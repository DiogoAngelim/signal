import { DatabaseSync } from 'node:sqlite';
import { units, check, id, fingerprint, validateQuote, afterCosts, integer, INTERVAL_MS, mean } from './contracts.mjs';
import { blockMeanInterval } from './research.mjs';

/** Single-host durable ledger. Requires persistent disk, not ephemeral/serverless replicas. */
export class EvidenceStore {
  constructor(filename, { now = Date.now, allowMemory = false } = {}) {
    check(typeof filename === 'string' && filename.length > 0 && (filename !== ':memory:' || allowMemory), 'durable_ledger_required');
    this.now = now; this.durable = filename !== ':memory:';
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (tenant TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(tenant,kind,id));
      CREATE INDEX IF NOT EXISTS records_chronological ON records(tenant,kind,created_at,id);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, tenant TEXT NOT NULL, event TEXT NOT NULL,
        body TEXT NOT NULL, at INTEGER NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS executions (tenant TEXT NOT NULL, id TEXT NOT NULL, plan TEXT NOT NULL,
        status TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(tenant,id));`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  append(tenant, event, payload) {
    id(tenant, 'tenant'); id(event, 'event'); const body = JSON.stringify(payload), at = this.now();
    const previous = this.db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get()?.hash || 'genesis';
    const hash = fingerprint({ tenant, event, body, at, previous });
    this.db.prepare('INSERT INTO audit(tenant,event,body,at,previous_hash,hash) VALUES(?,?,?,?,?,?)').run(tenant,event,body,at,previous,hash);
    return hash;
  }
  put(tenant, kind, key, value) {
    id(tenant); id(kind); id(key);
    check(JSON.stringify(value).length <= 4000000, 'record_too_large');
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM records WHERE tenant=? AND kind=?').get(tenant,kind).n;
    check(count < 10000, 'ledger_retention_review_required');
    this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?)').run(tenant, kind, key, JSON.stringify(value), this.now());
    return value;
  }
  get(tenant, kind, key) { const row = this.db.prepare('SELECT body FROM records WHERE tenant=? AND kind=? AND id=?').get(tenant,kind,key);
    return row ? JSON.parse(row.body) : null; }
  list(tenant, kind, limit = 1000) {
    integer(limit,'record_limit',1,10000);
    return this.db.prepare('SELECT body FROM records WHERE tenant=? AND kind=? ORDER BY created_at,id LIMIT ?').all(tenant,kind,limit).map(r => JSON.parse(r.body));
  }
  currentProfile(tenant) {
    const event=this.db.prepare("SELECT body FROM audit WHERE tenant=? AND event='profile.saved' ORDER BY seq DESC LIMIT 1").get(tenant);
    return event?this.get(tenant,'profile',JSON.parse(event.body).hash):null;
  }
  freeze(tenant, report) {
    check(report?.strategyHash && report.reportHash, 'invalid_research_report');
    const { reportHash, ...body } = report; check(fingerprint(body) === reportHash, 'research_hash_mismatch');
    check(report.validation?.passed === true, 'historical_validation_failed');
    check(fingerprint(report.model) === report.strategyHash, 'model_hash_mismatch');
    check(report.partitions.test.end <= this.now(), 'future_backtest');
    return this.transaction(() => {
      const prior = this.get(tenant, 'strategy', report.strategyHash); if (prior) return prior;
      const frozen = { ...report, frozenAt: this.now(), prospective: { passed: false } };
      this.put(tenant, 'strategy', report.strategyHash, frozen); this.append(tenant, 'strategy.frozen', { strategyHash: report.strategyHash, reportHash });
      return frozen;
    });
  }
  observe(tenant, strategyHash, quote) {
    const strategy = this.get(tenant, 'strategy', strategyHash); check(strategy, 'unknown_strategy');
    validateQuote(quote, { now: this.now(), symbol: strategy.symbol, expectedRelease: strategy.dataRelease });
    check(quote.observedAt >= strategy.frozenAt && quote.observedAt > strategy.partitions.test.end, 'not_prospective');
    const horizon = INTERVAL_MS[strategy.interval] * strategy.model.config.horizon;
    const bucket = Math.floor(this.now() / horizon), key = `${strategyHash}:${bucket}`;
    return this.transaction(() => {
      const existing = this.get(tenant, 'observation', key); if (existing) return existing;
      const record = { id: key, strategyHash, symbol: strategy.symbol, emittedAt: this.now(),
        eventAt: quote.observedAt, entryPrice: quote.ask, dueAt: this.now() + horizon,
        evidenceType: 'prospective_shadow', costs: strategy.costs };
      this.put(tenant, 'observation', key, record); this.append(tenant, 'shadow.emitted', record); return record;
    });
  }
  resolve(tenant, observationId, quote) {
    const observation = this.get(tenant, 'observation', observationId); check(observation, 'unknown_observation');
    const strategy = this.get(tenant,'strategy',observation.strategyHash);
    validateQuote(quote,{now:this.now(),symbol:observation.symbol,expectedRelease:strategy.dataRelease});
    check(this.now() >= observation.dueAt && quote.observedAt >= observation.dueAt, 'outcome_not_mature');
    check(quote.observedAt - observation.dueAt <= Math.min(INTERVAL_MS[strategy.interval] / 4, 300000), 'missed_outcome_window');
    return this.transaction(() => {
      const old = this.get(tenant,'outcome',observationId); if (old) return old;
      const result = { ...observation, resolvedAt: this.now(), exitPrice: quote.bid,
        netReturn: afterCosts(observation.entryPrice, quote.bid, { ...observation.costs, spreadBps: 0 }),
        source: 'server_observed_quote', evidenceType: 'prospective_shadow' };
      this.put(tenant,'outcome',observationId,result); this.append(tenant,'shadow.resolved',result); return result;
    });
  }
  forward(tenant, strategyHash, { minimumDays = 30, minimumObservations = 30 } = {}) {
    integer(minimumDays,'minimum_days',30,3650); integer(minimumObservations,'minimum_observations',30,10000);
    const strategy = this.get(tenant,'strategy',strategyHash); check(strategy,'unknown_strategy');
    const rows = this.list(tenant,'outcome',10000).filter(r => r.strategyHash === strategyHash && r.emittedAt >= strategy.frozenAt
      && r.evidenceType === 'prospective_shadow' && r.source === 'server_observed_quote').sort((a,b) => a.emittedAt-b.emittedAt);
    const days = new Map();
    for (const row of rows) { const day = Math.floor(row.emittedAt / 86400000); const list = days.get(day) || []; list.push(row.netReturn); days.set(day,list); }
    const returns = [...days.values()].map(mean);
    const elapsedDays = (this.now()-strategy.frozenAt)/86400000;
    const interval = returns.length >= 5 ? blockMeanInterval(returns,{blockLength:Math.min(5,returns.length)}) : null;
    const passed = this.durable && elapsedDays >= minimumDays && rows.length >= minimumObservations
      && returns.length >= minimumDays && Boolean(interval && interval.lower > 0);
    return { strategyHash, passed, evidenceType:'prospective_shadow', actualExchangeFills:false, elapsedDays,
      observations: rows.length, independentDayClusters:returns.length, interval,
      blockers:[...(!this.durable?['durable_evidence_required']:[]),...(elapsedDays<minimumDays?['forward_time_required']:[]),
        ...(returns.length<minimumDays||rows.length<minimumObservations?['forward_sample_required']:[]),
        ...(!(interval?.lower>0)?['positive_net_forward_evidence_required']:[])] };
  }
  reserveExecution(tenant, key, plan, maxDailyNotional = Infinity) {
    return this.transaction(() => {
      const prior=this.db.prepare('SELECT status,body FROM executions WHERE tenant=? AND id=?').get(tenant,key);
      if(prior) return { acquired:false,status:prior.status,body:JSON.parse(prior.body) };
      const active=this.db.prepare("SELECT id FROM executions WHERE tenant=? AND status IN ('reserved','submitted','unknown') LIMIT 1").get(tenant);
      check(!active,'unresolved_execution_exists');
      const since = Math.floor(this.now()/86400000)*86400000;
      const daily = this.db.prepare("SELECT plan FROM executions WHERE tenant=? AND created_at>=? AND status NOT IN ('rejected','cancelled')").all(tenant,since);
      const spent = daily.reduce((s,r)=>s+JSON.parse(r.plan).orders.reduce((n,o)=>n+units(o.notional),0n),0n);
      if(Number.isFinite(maxDailyNotional))check(spent+plan.orders.reduce((n,o)=>n+units(o.notional),0n)<=units(maxDailyNotional),'notional_budget_exceeded');
      this.db.prepare('INSERT INTO executions VALUES(?,?,?,?,?,?)').run(tenant,key,JSON.stringify(plan),'reserved','{}',this.now());
      this.append(tenant,'execution.reserved',{key,planHash:plan.planHash});return {acquired:true,status:'reserved'};
    });
  }
  finishExecution(tenant,key,status,body) {
    check(['submitted','unknown','rejected','filled','cancelled'].includes(status),'invalid_execution_status');
    return this.transaction(()=>{
      this.db.prepare('UPDATE executions SET status=?,body=? WHERE tenant=? AND id=?').run(status,JSON.stringify(body),tenant,key);
      this.append(tenant,'execution.state',{key,status});return {status,body};
    });
  }
  close() { this.db.close(); }
}

/** Inputs here are server-owned; request-body approval flags never authorize execution. */
export async function executeApprovedPlan({ tenant, plan, strategyHashes, store, permissions, broker, mode = 'paper', now = Date.now() }) {
  check(['paper','testnet','live'].includes(mode),'invalid_execution_mode');
  check(plan && plan.expiresAt > now && plan.generatedAt <= now && now-plan.generatedAt<=15000,'stale_plan');
  const {planHash,...payload}=plan;check(fingerprint(payload)===planHash,'plan_hash_mismatch');
  check(plan.optimizer?.certificate?.converged,'uncertified_plan');
  if(mode!=='paper') {
    check(store.durable,'durable_execution_required');
    check(permissions?.enabled===true && permissions.tenant===tenant && permissions.mode===mode && permissions.expiresAt>now,'trading_permission_required');
    check(permissions.securityReviewCleared===true && permissions.killSwitch===false,'operational_clearance_required');
    check(permissions.reconciledAccountAt>=now-15000 && permissions.reconciledAccountAt<=now,'account_reconciliation_required');
    check(permissions.profileHash===plan.riskProfileHash,'risk_profile_changed');
    check(permissions.accountHash===plan.accountHash,'account_changed');
    check(Array.isArray(strategyHashes)&&strategyHashes.length>0,'strategy_evidence_required');
    check(fingerprint([...strategyHashes].sort())===fingerprint([...plan.strategyHashes].sort()),'strategy_plan_mismatch');
    for(const hash of strategyHashes) check(store.forward(tenant,hash).passed,'prospective_validation_required');
    for(const order of plan.orders) check(permissions.allowedSymbols.includes(order.symbol),'symbol_not_permitted');
    const notional=plan.orders.reduce((s,o)=>s+units(o.notional),0n);
    check(notional<=units(permissions.maxBatchNotional) && notional+units(permissions.spentToday)<=units(permissions.maxDailyNotional),'notional_budget_exceeded');
    check(broker && typeof broker.submitLimit==='function','broker_required');
    if(mode==='live') check(permissions.liveAcknowledged===true,'live_acknowledgement_required');
  }
  const key=planHash;
  const lease=store.reserveExecution(tenant,key,plan,mode==='paper'?Infinity:permissions.maxDailyNotional);
  if(!lease.acquired)return {duplicate:true,...lease};
  if(mode==='paper'&&broker?.settlePaper)return broker.settlePaper(tenant,key,plan);
  if(mode==='paper')return store.finishExecution(tenant,key,'filled',{mode,simulated:true,orders:plan.orders,liveOrdersPlaced:0});
  const results=[];
  try {
    for(let i=0;i<plan.orders.length;i++) {
      const order=plan.orders[i];if(order.action==='HOLD')continue;
      check(store.now()<plan.expiresAt,'plan_expired_during_execution');
      store.finishExecution(tenant,key,'submitted',{results,pendingIndex:i});
      const result=await broker.submitLimit({...order,expiresAt:plan.expiresAt,clientOrderId:`vi${planHash.slice(0,25)}${i}`});
      results.push(result);
      if(result.status!=='FILLED') return store.finishExecution(tenant,key,'unknown',{results,reconciliationRequired:true});
    }
    return store.finishExecution(tenant,key,'filled',{results});
  } catch {
    return store.finishExecution(tenant,key,'unknown',{results,reconciliationRequired:true,automaticResubmission:false});
  }
}
