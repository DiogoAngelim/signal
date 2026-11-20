import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { EvidenceStore } from './evidence.mjs';
import { check, id, integer, fingerprint, units } from './contracts.mjs';

const DAY = 86400000;
function digestFile(file) {
  const fd = fs.openSync(file, 'r');
  const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function inspectDatabase(db) {
  check(Object.values(db.prepare('PRAGMA quick_check').get())[0] === 'ok', 'ledger_integrity_failed');
  let previous = 'genesis', count = 0;
  for (const row of db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
    check(row.previous_hash === previous && fingerprint({ tenant: row.tenant, event: row.event,
      body: row.body, at: row.at, previous }) === row.hash, 'audit_chain_corrupted');
    previous = row.hash; count++;
  }
  return { auditHead: previous, auditEvents: count,
    records: Number(db.prepare('SELECT COUNT(*) AS n FROM records').get().n),
    executions: Number(db.prepare('SELECT COUNT(*) AS n FROM executions').get().n) };
}

/** One account identity, one renewable writer lease, persistent disk. Not distributed HA. */
export class OperationalLedger extends EvidenceStore {
  constructor(filename, { owner, mode = 'paper', now = Date.now, allowMemory = false } = {}) {
    id(owner, 'owner'); check(['paper', 'testnet', 'live'].includes(mode), 'invalid_ledger_mode');
    if (filename !== ':memory:') {
      check(path.isAbsolute(filename), 'absolute_ledger_path_required');
      if (fs.existsSync(filename)) check(!fs.lstatSync(filename).isSymbolicLink(), 'ledger_symlink_forbidden');
    }
    super(filename, { now, allowMemory });
    try {
      this.owner = owner; this.mode = mode; this.filename = filename;
      this.leaseToken = null; this.leaseRequired = false;
      this.db.exec(`CREATE TABLE IF NOT EXISTS operational_identity (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, mode TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operational_lease (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS operational_state (key TEXT PRIMARY KEY, body TEXT NOT NULL);`);
      this.db.prepare('INSERT OR IGNORE INTO operational_identity VALUES(1,?,?)').run(owner, mode);
      const identity = this.db.prepare('SELECT owner,mode FROM operational_identity WHERE id=1').get();
      check(identity.owner === owner && identity.mode === mode, 'ledger_identity_mismatch');
      this.verifyIntegrity();
      if (this.durable) fs.chmodSync(filename, 0o600);
    } catch (error) { super.close(); throw error; }
  }
  verifyIntegrity() { return inspectDatabase(this.db); }
  transaction(fn) {
    if (this.leaseRequired) this.assertLease();
    return super.transaction(() => {
      const result = fn();
      check(!result || typeof result.then !== 'function', 'async_ledger_transaction_forbidden');
      return result;
    });
  }
  acquireLease(ttlMs = 30000) {
    integer(ttlMs, 'lease_ttl', 1000, 120000);
    check(!this.leaseToken, 'lease_already_owned');
    const token = randomUUID();
    super.transaction(() => {
      const current = this.db.prepare('SELECT * FROM operational_lease WHERE id=1').get();
      check(!current || current.expires_at <= this.now(), 'another_worker_owns_ledger');
      this.db.prepare('INSERT OR REPLACE INTO operational_lease VALUES(1,?,?)').run(token, this.now() + ttlMs);
    });
    this.leaseToken = token; this.leaseRequired = true; this.leaseTtlMs = ttlMs;
    return token;
  }
  assertLease() {
    const row = this.db.prepare('SELECT * FROM operational_lease WHERE id=1').get();
    check(this.leaseToken && row?.token === this.leaseToken && row.expires_at > this.now(), 'worker_lease_lost');
  }
  renewLease() {
    this.assertLease();
    const result = this.db.prepare('UPDATE operational_lease SET expires_at=? WHERE id=1 AND token=? AND expires_at>?')
      .run(this.now() + this.leaseTtlMs, this.leaseToken, this.now());
    check(result.changes === 1, 'worker_lease_lost');
  }
  releaseLease() {
    if (this.leaseToken) this.db.prepare('DELETE FROM operational_lease WHERE id=1 AND token=?').run(this.leaseToken);
    this.leaseToken = null;
  }
  execution(tenant, key) {
    id(tenant); id(key);
    const row = this.db.prepare('SELECT * FROM executions WHERE tenant=? AND id=?').get(tenant, key);
    return row ? { status: row.status, plan: JSON.parse(row.plan), body: JSON.parse(row.body), createdAt: row.created_at } : null;
  }
  unresolved(tenant) {
    id(tenant);
    return this.db.prepare("SELECT id,status FROM executions WHERE tenant=? AND status IN ('reserved','submitted','unknown') ORDER BY created_at")
      .all(tenant).map(row => ({ ...row }));
  }
  forward(tenant, hash, options = {}) {
    const result = super.forward(tenant, hash, options);
    const observations = this.list(tenant, 'observation', 10000).filter(r => r.strategyHash === hash && r.dueAt <= this.now() - 300000);
    const outcomes = this.list(tenant, 'outcome', 10000).filter(r => r.strategyHash === hash);
    const resolvedIds = new Set(outcomes.map(r => r.id));
    const missing = observations.filter(r => !resolvedIds.has(r.id)).length;
    const coverage = observations.length ? (observations.length - missing) / observations.length : 0;
    const newest = outcomes.reduce((at, r) => Math.max(at, r.resolvedAt), 0);
    const stale = !newest || this.now() - newest > 2 * DAY;
    const blockers = [...result.blockers, ...(coverage < 0.95 ? ['forward_outcome_coverage_required'] : []),
      ...(stale ? ['recent_forward_evidence_required'] : [])];
    return { ...result, passed: result.passed && blockers.length === 0, blockers,
      missingMaturedOutcomes: missing, outcomeCoverage: coverage, staleEvidence: stale };
  }
  backup(destination) {
    if (this.leaseRequired) this.assertLease();
    check(this.durable && path.isAbsolute(destination), 'absolute_backup_path_required');
    check(!fs.existsSync(destination) && !fs.existsSync(`${destination}.json`), 'backup_destination_exists');
    const parent = fs.lstatSync(path.dirname(destination));
    check(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0, 'private_backup_directory_required');
    const before = this.verifyIntegrity();
    this.db.prepare('VACUUM INTO ?').run(destination);
    fs.chmodSync(destination, 0o600);
    const copy = new DatabaseSync(destination, { readOnly: true });
    let after;
    try { after = inspectDatabase(copy); } finally { copy.close(); }
    check(fingerprint(before) === fingerprint(after), 'backup_snapshot_mismatch');
    const manifest = { version: 'ledger-backup.v1', createdAt: this.now(), bytes: fs.statSync(destination).size,
      sha256: digestFile(destination), owner: this.owner, mode: this.mode, ...after,
      limitation: 'Store this digest independently. A colocated editable manifest alone is not an authenticity proof.' };
    const fd = fs.openSync(`${destination}.json`, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(manifest, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return manifest;
  }
  close() { this.releaseLease(); super.close(); }
}

/** Never overwrites a running database. Caller supplies a digest from an independent trusted record. */
export function restoreLedger(snapshot, destination, { trustedSha256 } = {}) {
  check(/^[a-f0-9]{64}$/.test(trustedSha256 || ''), 'trusted_backup_digest_required');
  check(path.isAbsolute(snapshot) && path.isAbsolute(destination), 'absolute_restore_paths_required');
  check(!fs.lstatSync(snapshot).isSymbolicLink() && digestFile(snapshot) === trustedSha256, 'backup_digest_mismatch');
  check(!['', '-wal', '-shm'].some(suffix => fs.existsSync(destination + suffix)), 'restore_destination_exists');
  const source = new DatabaseSync(snapshot, { readOnly: true });
  let verified;
  try { verified = inspectDatabase(source); } finally { source.close(); }
  fs.copyFileSync(snapshot, destination, fs.constants.COPYFILE_EXCL); fs.chmodSync(destination, 0o600);
  const copy = new DatabaseSync(destination);
  try {
    check(fingerprint(inspectDatabase(copy)) === fingerprint(verified), 'restored_snapshot_mismatch');
    // A lease cannot survive a deliberately verified offline restore onto a new database.
    copy.exec('DELETE FROM operational_lease');
  } catch (error) { copy.close(); fs.rmSync(destination, { force: true }); throw error; }
  copy.close(); return verified;
}

/** Read-only exchange reconciliation; missing/ambiguous orders never clear a reservation. */
export async function reconcileExecution({ store, tenant, key, broker, accountPort, profile }) {
  check(tenant === store.owner, 'account_owner_mismatch');
  const record = store.execution(tenant, key); check(record, 'unknown_execution');
  if (!['reserved', 'submitted', 'unknown'].includes(record.status)) return { duplicate: true, ...record };
  check(broker?.order && accountPort?.snapshot && profile, 'reconciliation_ports_required');
  const orders = [];
  for (let i = 0; i < record.plan.orders.length; i++) {
    const expected = record.plan.orders[i]; if (expected.action === 'HOLD') continue;
    const clientOrderId = `vi${key.slice(0, 25)}${i}`;
    let found;
    try { found = await broker.order(expected.symbol, clientOrderId); }
    catch { return { status: 'unknown', blocker: 'order_not_independently_resolved', automaticResubmission: false }; }
    check(found.symbol === expected.symbol && found.clientOrderId === clientOrderId && found.side === expected.action,
      'reconciled_order_identity_mismatch');
    check(units(found.origQty) === units(expected.quantity) && units(found.executedQty) <= units(found.origQty), 'reconciled_quantity_mismatch');
    check(['FILLED', 'EXPIRED', 'CANCELED', 'REJECTED', 'EXPIRED_IN_MATCH'].includes(found.status), 'order_still_open');
    check(found.status !== 'FILLED' || units(found.executedQty) === units(found.origQty), 'inconsistent_filled_order');
    orders.push({ symbol: found.symbol, clientOrderId, status: found.status, executedQty: found.executedQty,
      quoteQuantity: found.cummulativeQuoteQty, orderId: found.orderId });
  }
  const account = await accountPort.snapshot(tenant, profile);
  check(account.reconciled === true && account.openOrders === 0 && account.syncedAt <= store.now()
    && store.now() - account.syncedAt <= 15000, 'fresh_reconciled_account_required');
  return store.transaction(() => {
    const current = store.execution(tenant, key); check(current.status === record.status, 'execution_state_changed');
    const body = { orders, reconciledAt: store.now(), accountHash: fingerprint({ ...account, syncedAt: 0 }),
      noOrdersSubmitted: true, requiresNewPlan: true, actualCommissionAccountingCertified: false };
    store.db.prepare("UPDATE executions SET status='reconciled',body=? WHERE tenant=? AND id=?")
      .run(JSON.stringify(body), tenant, key);
    store.append(tenant, 'execution.reconciled', { key, ...body });
    return { status: 'reconciled', body };
  });
}
