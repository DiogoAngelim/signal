import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { check, id } from './contracts.mjs';
import { OperationalLedger } from './operational-ledger.mjs';
import { BoundDataClient, createOperationalService, managedAutonomy } from './lifecycle.mjs';
import { createInvestingHandler, isolatedResearch } from './http.mjs';
import { VerifiedBinancePorts } from './binance.mjs';
import { PaperPortfolio } from './paper.mjs';

export function readPrivateConfig(filename) {
  check(filename && path.isAbsolute(filename), 'absolute_private_config_path_required');
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const info = fs.fstatSync(fd);
    check(info.isFile() && info.size <= 65536, 'invalid_config_file');
    check((info.mode & 0o077) === 0 && (process.getuid === undefined || info.uid === process.getuid()), 'config_must_be_owner_only');
    const config = JSON.parse(fs.readFileSync(fd, 'utf8')); id(config.owner, 'owner');
    check(['paper', 'testnet', 'live'].includes(config.mode || 'paper'), 'invalid_mode');
    check(config.apiKeys && typeof config.apiKeys === 'object' && !Array.isArray(config.apiKeys), 'api_key_registry_required');
    for (const [digest, grant] of Object.entries(config.apiKeys)) {
      check(/^[a-f0-9]{64}$/.test(digest) && Number.isFinite(grant.expiresAt) && Array.isArray(grant.scopes), 'invalid_api_grant');
      id(grant.subject, 'subject');
    }
    return config;
  } finally { fs.closeSync(fd); }
}

/** Importable boot/shutdown path; importing this file cannot start a listener or broker. */
export async function startInvestingServer({ configPath = process.env.VERIFIED_INVESTING_CONFIG,
  environment = process.env, port: injectedPort, dataClient: injectedData, signal: injectedSignal,
  researchPort = isolatedResearch, onEvent = event => console.log(JSON.stringify(event)) } = {}) {
  process.umask(0o077);
  const configuration = () => readPrivateConfig(configPath), config = configuration(), mode = config.mode || 'paper';
  const current = () => {
    const next = configuration();
    check((next.mode || 'paper') === mode && next.owner === config.owner && next.ledgerFile === config.ledgerFile,
      'configuration_identity_changed');
    return next;
  };
  check(path.isAbsolute(config.ledgerFile || '') && config.ledgerFile !== ':memory:', 'persistent_ledger_path_required');
  const directory = path.dirname(config.ledgerFile);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  check(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'private_ledger_directory_required');
  const store = new OperationalLedger(config.ledgerFile, { owner: config.owner, mode });
  let heartbeat, server, handler, worker, service, dataClient, closing;
  try {
    store.acquireLease();
    const lock = JSON.parse(fs.readFileSync(new URL('../dependency-lock.json', import.meta.url), 'utf8'));
    const signal = injectedSignal || await import('../dist/signal-adapter.mjs');
    dataClient = injectedData || new BoundDataClient({ url: config.data.url, expectedRelease: lock.marketData.commit,
      token: environment.MARKET_DATA_READ_TOKEN, streaming: config.data.streaming === true });
    let accountPort, filterPort, permissionPort, brokerPort;
    if (mode === 'paper' && config.paper) {
      const paper = new PaperPortfolio({ store, tenant: config.owner, seed: config.paper.account,
        filters: config.paper.filters, quotePort: dataClient });
      accountPort = filterPort = brokerPort = paper;
    } else if (mode !== 'paper') {
      check(config.permissions?.enabled === true, 'explicit_operator_permission_required');
      const broker = new VerifiedBinancePorts({ mode, apiKey: environment.BINANCE_API_KEY,
        apiSecret: environment.BINANCE_API_SECRET, owner: config.owner, permissions: () => current().permissions,
        profileLookup: tenant => store.currentProfile(tenant), quotePort: dataClient });
      accountPort = filterPort = permissionPort = brokerPort = broker;
    }
    service = createOperationalService({ store, dataClient, signal, runtime: signal.createInvestingRuntime(),
      mode, accountPort, filterPort, permissionPort, brokerPort, researchPort });
    handler = createInvestingHandler({ service, keyRegistry: () => current().apiKeys });
    server = createServer(handler);
    const port = injectedPort ?? Number(environment.PORT || 4030);
    check(Number.isSafeInteger(port) && port >= (injectedPort === 0 ? 0 : 1) && port < 65536, 'invalid_port');
    server.headersTimeout = 10000; server.requestTimeout = 45000; server.maxHeadersCount = 40;
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(port, environment.HOST || '127.0.0.1', () => {
        server.removeListener('error', reject); resolve();
      });
    });
    async function close() {
      if (closing) return closing;
      closing = (async () => {
        // Stop scheduling first, then drain active work; storage stays open until it completes.
        const stopped = worker?.stop();
        const httpDone = handler.close();
        const workDone = service.drain();
        server.closeIdleConnections?.();
        await Promise.all([stopped, httpDone, workDone]);
        await new Promise(resolve => server.close(resolve));
        clearInterval(heartbeat); store.close();
        onEvent({ event: 'verified_investing.stopped', mode, ledgerClosedAfterDrain: true });
      })();
      return closing;
    }
    heartbeat = setInterval(() => {
      try { store.renewLease(); }
      catch { onEvent({ event: 'verified_investing.lease_lost', mode }); void close(); }
    }, 5000);
    heartbeat.unref();
    if (config.autonomy?.enabled === true) {
      worker = managedAutonomy({ service, tenant: config.owner, strategyHashes: config.autonomy.strategies,
        permissionSource: () => current().autonomy, intervalMs: config.autonomy.intervalMs || 60000,
        onError: code => onEvent({ event: 'autonomy.stopped', code }),
        onResult: result => onEvent({ event: 'autonomy.cycle', status: result.status || 'blocked' }) });
    }
    onEvent({ event: 'verified_investing.started', mode, autonomy: Boolean(worker), sourceCommit: lock.signal.commit });
    return { server, service, store, close, address: server.address() };
  } catch (error) {
    clearInterval(heartbeat); await worker?.stop(); await handler?.close(); await service?.drain();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    store.close(); throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const running = await startInvestingServer();
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { void running.close(); });
}
