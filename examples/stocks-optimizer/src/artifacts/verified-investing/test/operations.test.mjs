import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OperationalLedger, restoreLedger, reconcileExecution } from '../src/operational-ledger.mjs';
import { managedAutonomy, createOperationalService, BoundDataClient } from '../src/lifecycle.mjs';
import { fingerprint, sha256 } from '../src/contracts.mjs';
import { readPrivateConfig, startInvestingServer } from '../src/server.mjs';
import { createInvestingHandler } from '../src/http.mjs';
import { createServer } from 'node:http';
const NOW = 1800000000000, DAY = 86400000;
function directory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'investing-ops-')); }
function storeAt(dir, now = () => NOW) { return new OperationalLedger(path.join(dir, 'ledger.db'), { owner: 'alice', now }); }
const fixturePlan = () => ({ planHash: 'a'.repeat(64), orders: [{ symbol: 'BTCUSDT', action: 'BUY', quantity: '1', limitPrice: '100', notional: '100' }] });
test('lease excludes a second worker and expires without allowing stale writer resurrection', () => {
  const dir = directory(); let now = NOW; const a = storeAt(dir, () => now), b = storeAt(dir, () => now);
  try {
    a.acquireLease(1000); assert.throws(() => b.acquireLease(), /another_worker/);
    now += 1001; assert.throws(() => a.renewLease(), /worker_lease_lost/); b.acquireLease();
    assert.throws(() => a.transaction(() => a.append('alice', 'bad.write', {})), /worker_lease_lost/);
    a.close(); b.assertLease();
  } finally { b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('account identity and paper/live ledger identity cannot be silently changed', () => {
  const dir = directory(), s = storeAt(dir); s.close();
  try { for (const patch of [{ owner: 'bob' }, { owner: 'alice', mode: 'live' }])
    assert.throws(() => new OperationalLedger(path.join(dir, 'ledger.db'), patch), /identity_mismatch/); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('backup and restore preserve audit chain, research and unresolved execution across real SQLite reopen', () => {
  const dir = directory(), s = storeAt(dir); let restored;
  try {
    s.acquireLease(); s.transaction(() => { s.put('alice', 'research', 'fixture', { explicitlyTestFixture: true }); s.append('alice', 'test.fixture', { value: 1 }); });
    s.reserveExecution('alice', 'unknown', fixturePlan()); s.finishExecution('alice', 'unknown', 'unknown', { reconciliationRequired: true });
    const snapshot = path.join(dir, 'backup.db'), manifest = s.backup(snapshot);
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/); assert.equal(fs.statSync(snapshot).mode & 0o077, 0);
    const dest = path.join(dir, 'restored.db'); restoreLedger(snapshot, dest, { trustedSha256: manifest.sha256 });
    restored = new OperationalLedger(dest, { owner: 'alice', now: () => NOW }); restored.acquireLease();
    assert.equal(restored.get('alice', 'research', 'fixture').explicitlyTestFixture, true);
    assert.equal(restored.unresolved('alice').length, 1); assert.equal(restored.verifyIntegrity().auditHead, manifest.auditHead);
    assert.throws(() => restored.reserveExecution('alice', 'second', fixturePlan()), /unresolved_execution/);
    assert.throws(() => restoreLedger(snapshot, dest, { trustedSha256: manifest.sha256 }), /destination_exists/);
    fs.appendFileSync(snapshot, 'corruption'); assert.throws(() => restoreLedger(snapshot, path.join(dir, 'bad.db'), { trustedSha256: manifest.sha256 }), /digest_mismatch/);
  } finally { restored?.close(); s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('audit payload tampering blocks verification and an async callback rolls back', () => {
  const dir = directory(), s = storeAt(dir);
  try {
    assert.throws(() => s.transaction(() => { s.append('alice', 'test.rollback', {}); return Promise.resolve(); }), /async_ledger/);
    assert.equal(s.verifyIntegrity().auditEvents, 0);
    s.transaction(() => s.append('alice', 'test.event', { value: 1 }));
    s.db.exec("UPDATE audit SET body='{}' WHERE seq=1"); assert.throws(() => s.verifyIntegrity(), /audit_chain_corrupted/);
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('order reconciliation only reads broker state and preserves exact partial fill quantities', async () => {
  const dir = directory(), s = storeAt(dir); s.acquireLease();
  const key = 'a'.repeat(64), plan = fixturePlan(); s.reserveExecution('alice', key, plan); s.finishExecution('alice', key, 'unknown', {});
  let reads = 0;
  const broker = { order: async (symbol, clientOrderId) => { reads++; return { symbol, clientOrderId, side: 'BUY', origQty: '1', executedQty: '0.4', status: 'EXPIRED', cummulativeQuoteQty: '40', orderId: 7 }; },
    submitLimit: async () => { assert.fail('reconciliation must not submit orders'); } };
  try {
    const result = await reconcileExecution({ store: s, tenant: 'alice', key, broker, profile: {},
      accountPort: { snapshot: async () => ({ reconciled: true, openOrders: 0, syncedAt: NOW }) } });
    assert.equal(result.status, 'reconciled'); assert.equal(result.body.orders[0].executedQty, '0.4'); assert.equal(reads, 1);
    assert.equal(s.unresolved('alice').length, 0); s.reserveExecution('alice', 'new', plan);
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('missing, wrong-identity or still-open exchange orders cannot clear an unresolved reservation', async () => {
  const dir = directory(), s = storeAt(dir); const key = 'a'.repeat(64); s.reserveExecution('alice', key, fixturePlan());
  const input = { store: s, tenant: 'alice', key, profile: {}, accountPort: { snapshot: async () => ({ reconciled: true, openOrders: 0, syncedAt: NOW }) } };
  try {
    assert.equal((await reconcileExecution({ ...input, broker: { order: async () => { throw Error('unknown'); } } })).status, 'unknown');
    await assert.rejects(reconcileExecution({ ...input, broker: { order: async () => ({ symbol: 'OTHER' }) } }), /identity_mismatch/);
    assert.equal(s.unresolved('alice').length, 1);
  } finally { s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
function timerHarness() { const jobs = []; return { jobs, setTimeout(fn) { jobs.push(fn); return fn; }, clearTimeout(fn) { const i = jobs.indexOf(fn); if (i >= 0) jobs.splice(i, 1); } }; }
test('autonomy reloads revocation after planning and does not submit the planned batch', async () => {
  const timers = timerHarness(); let allowed = true, executions = 0;
  const worker = managedAutonomy({ tenant: 'alice', strategyHashes: ['abc'], now: () => NOW, timers,
    permissionSource: () => ({ enabled: allowed, expiresAt: NOW + 10000 }),
    service: { plan: async () => { allowed = false; return { planHash: 'abc' }; }, execute: async () => { executions++; } } });
  timers.jobs.shift()(); await new Promise(resolve => setImmediate(resolve)); await worker.stop();
  assert.equal(executions, 0); assert.equal(worker.running, false);
});
test('worker shutdown waits for active work and does not execute after cancellation', async () => {
  const timers = timerHarness(); let resolvePlan, executions = 0, closed = false;
  const worker = managedAutonomy({ tenant: 'alice', strategyHashes: ['abc'], now: () => NOW, timers,
    permissionSource: () => ({ enabled: true, expiresAt: NOW + DAY }),
    service: { plan: () => new Promise(resolve => { resolvePlan = resolve; }), execute: async () => { executions++; } } });
  timers.jobs.shift()(); const stopped = worker.stop().then(() => { closed = true; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
  resolvePlan({ planHash: 'abc' }); await stopped; assert.equal(executions, 0); assert.equal(timers.jobs.length, 0);
});
test('consumer binds history identity to the requested symbol and interval', async () => {
  const release = 'a'.repeat(40), now = Math.floor(NOW / DAY) * DAY, bars = Array.from({ length: 2 }, (_, i) => ({ timestamp: now - (2-i)*DAY,
    closeTime: now-(1-i)*DAY-1, open: 100, high: 102, low: 99, close: 101, volume: 2 }));
  const value = { schemaVersion: 'market-data.v1', provider: 'binance-public', releaseSha: release, symbol: 'ETHUSDT', interval: '1d', bars,
    dataHash: sha256(JSON.stringify(bars)), quality: { real: true, synthetic: false, closedOnly: true, complete: true }, consumption: { displayOnly: false } };
  let calls = 0; const client = new BoundDataClient({ url: 'https://fixture.invalid/api/verified-data', expectedRelease: release, now: () => NOW,
    fetchImpl: async () => { calls++; return Response.json(value); } });
  const requests = await Promise.allSettled([client.history('BTCUSDT','1d',2), client.history('BTCUSDT','1d',2)]);
  assert.ok(requests.every(r => r.status === 'rejected' && /data_symbol_mismatch/.test(r.reason.message))); assert.equal(calls, 1);
});
test('private config rejects broad permissions and symlinks without executing bootstrap code', () => {
  const dir = directory(), file = path.join(dir,'config.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ owner:'alice', mode:'paper', apiKeys:{} }), { mode:0o600 }); assert.equal(readPrivateConfig(file).owner,'alice');
    fs.chmodSync(file,0o644); assert.throws(() => readPrivateConfig(file),/owner_only/); fs.chmodSync(file,0o600);
    const link=path.join(dir,'link.json');fs.symlinkSync(file,link);assert.throws(() => readPrivateConfig(link));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('real startup serves authenticated API, excludes a second worker, drains and restarts with persistent ledger', async () => {
  const dir=directory(),file=path.join(dir,'config.json'),token='operational-test-only-token',digest=sha256(token);
  fs.writeFileSync(file,JSON.stringify({owner:'alice',mode:'paper',ledgerFile:path.join(dir,'ledger.db'),apiKeys:{[digest]:{subject:'alice',scopes:['investing:read'],expiresAt:Date.now()+DAY}},data:{url:'https://fixture.invalid'}}),{mode:0o600});
  let first,second;
  const options={configPath:file,environment:{},port:0,onEvent:()=>{},dataClient:{expectedRelease:'a'.repeat(40),streaming:false}};
  try {
    first=await startInvestingServer(options);const url=`http://127.0.0.1:${first.address.port}/api/investing/capabilities`;
    assert.equal((await fetch(url)).status,401);const response=await fetch(url,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);assert.equal((await response.json()).mode,'paper');
    await assert.rejects(startInvestingServer(options),/another_worker_owns_ledger/);
    await first.close();first=null;second=await startInvestingServer(options);assert.ok(second.address.port>0);
  } finally { await first?.close();await second?.close();fs.rmSync(dir,{recursive:true,force:true}); }
});
test('an authenticated retry returns durable execution state even after the plan has expired', async () => {
  const dir=directory(),s=storeAt(dir);s.acquireLease();const p=fixturePlan();s.reserveExecution('alice',p.planHash,p);s.finishExecution('alice',p.planHash,'filled',{simulated:true});
  const service=createOperationalService({store:s,dataClient:{},signal:{},runtime:{},now:()=>NOW+DAY});
  try {const result=await service.execute('alice',p.planHash);assert.equal(result.duplicate,true);assert.equal(result.status,'filled');
    await assert.rejects(service.execute('bob',p.planHash),/account_owner_mismatch/);await service.drain();await assert.rejects(service.execute('alice',p.planHash),/service_draining/);}
  finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('SSE rechecks token ownership after slow analysis and closes on reassignment', async () => {
  const token='sse-fixture-token',digest=sha256(token);let subject='alice',releaseAnalysis;
  const handler=createInvestingHandler({keyRegistry:()=>({[digest]:{subject,scopes:['investing:read'],expiresAt:Date.now()+DAY}}),
    service:{capabilities:()=>({streamingQuotes:true}),signals:()=>new Promise(resolve=>{releaseAnalysis=resolve;})}});
  const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/investing/stream?strategies=abc`,{headers:{authorization:`Bearer ${token}`}});
    subject='bob';releaseAnalysis({secretForAlice:true});assert.equal(await response.text(),'');
  } finally {await handler.close();server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}
});
