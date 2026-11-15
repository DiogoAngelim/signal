import { createHash, timingSafeEqual } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { check, id } from './contracts.mjs';

export function isolatedResearch(datasets, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./research-worker.mjs', import.meta.url), {
      workerData: { datasets, options }, resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    let done = false;
    const timer = setTimeout(() => finish(Error('research_time_budget_exhausted')), 25000);
    function finish(error, value) {
      if (done) return; done = true; clearTimeout(timer); void worker.terminate();
      error ? reject(error) : resolve(value);
    }
    worker.on('message', message => finish(message.ok ? null : Error(message.error), message.report));
    worker.on('error', () => finish(Error('research_worker_failed')));
    worker.on('exit', code => { if (!done) finish(Error(`research_worker_exited_${code}`)); });
  });
}

export function createInvestingHandler({ service, keyRegistry, now = Date.now,
  streamIntervalMs, timers = globalThis }) {
  check(keyRegistry && ['object', 'function'].includes(typeof keyRegistry), 'key_registry_required');
  const rate = new Map(), streams = new Set(), pending = new Set(); let closing = false;
  function authenticate(request, scope) {
    const header = String(request.headers.authorization || '');
    check(header.startsWith('Bearer ') && header.length <= 520, 'unauthorized');
    const digest = createHash('sha256').update(header.slice(7)).digest('hex'); let match;
    const registry = typeof keyRegistry === 'function' ? keyRegistry() : keyRegistry;
    for (const [hash, key] of Object.entries(registry || {})) {
      if (/^[a-f0-9]{64}$/.test(hash) && timingSafeEqual(Buffer.from(hash), Buffer.from(digest))) match = key;
    }
    check(match && Number.isFinite(match.expiresAt) && match.expiresAt > now() && Array.isArray(match.scopes)
      && match.scopes.includes(scope), 'unauthorized');
    return id(match.subject, 'subject');
  }
  function statusFor(code) {
    if (code === 'unauthorized') return 401;
    if (code === 'not_found' || code === 'route_not_found') return 404;
    if (code === 'method_not_allowed') return 405;
    if (code === 'body_too_large') return 413;
    if (code === 'service_draining' || code === 'worker_lease_lost') return 503;
    if (/rate_limit|capacity|busy|concurrency/.test(code)) return 429;
    return 422;
  }
  async function handle(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    let closeStream;
    try {
      check(!closing, 'service_draining');
      const url = new URL(request.url || '/', 'http://localhost');
      check(!url.hash && url.pathname.startsWith('/api/investing/'), 'route_not_found');
      const route = url.pathname.slice('/api/investing'.length), method = request.method || 'GET';
      check(['GET', 'POST'].includes(method), 'method_not_allowed');
      const scope = route === '/execute' ? 'investing:execute' : route === '/reconcile' ? 'investing:reconcile'
        : method === 'GET' ? 'investing:read' : 'investing:write';
      const tenant = authenticate(request, scope);
      const minute = Math.floor(now() / 60000), key = `${tenant}:${minute}`;
      for (const k of rate.keys()) if (!k.endsWith(`:${minute}`)) rate.delete(k);
      check(rate.size < 1000 || rate.has(key), 'request_capacity_exceeded');
      rate.set(key, (rate.get(key) || 0) + 1); check(rate.get(key) <= 60, 'rate_limit_exceeded');
      for (const k of url.searchParams.keys()) check(url.searchParams.getAll(k).length === 1, 'duplicate_parameter');
      const send = (status, body) => { if (!response.destroyed) { response.statusCode = status; response.end(JSON.stringify(body)); } };
      if (method === 'GET' && route === '/capabilities') return send(200, service.capabilities());
      if (method === 'GET' && route === '/operations') return send(200, service.operations ? service.operations(tenant) : { status: 'unsupported' });
      if (method === 'GET' && route === '/report') {
        const report = service.report(tenant, id(url.searchParams.get('id'), 'report_id'));
        return send(report ? 200 : 404, report || { error: 'not_found' });
      }
      if (method === 'GET' && ['/signals', '/stream'].includes(route)) {
        const hashes = (url.searchParams.get('strategies') || '').split(',').filter(Boolean);
        check(hashes.length >= 1 && hashes.length <= 20 && new Set(hashes).size === hashes.length, 'invalid_strategy_list');
        hashes.forEach(h => id(h, 'strategy'));
        if (route === '/signals') return send(200, await service.signals(tenant, hashes));
        check(streams.size < 20, 'stream_capacity_exceeded');
        response.setHeader('Content-Type', 'text/event-stream'); response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no'); response.flushHeaders?.();
        let timer, closed = false, count = 0;
        closeStream = () => { if (closed) return; closed = true; streams.delete(closeStream); timers.clearTimeout(timer); response.end(); };
        streams.add(closeStream); request.on('aborted', closeStream); response.on('close', closeStream);
        const tick = async () => {
          if (closed || closing) return closeStream();
          try { check(authenticate(request, 'investing:read') === tenant, 'unauthorized'); }
          catch { return closeStream(); }
          try {
            const data = await service.signals(tenant, hashes);
            // A revoked/reassigned token cannot receive the result of an already-started request.
            check(authenticate(request, 'investing:read') === tenant, 'unauthorized');
            if (closed) return;
            if (!response.write(`event: signal\ndata: ${JSON.stringify(data)}\n\n`)) return closeStream();
          } catch (error) {
            if (error.code === 'unauthorized' || error.code === 'service_draining') return closeStream();
            if (!closed && !response.write('event: unavailable\ndata: {"action":"HOLD","quantity":"0"}\n\n')) return closeStream();
          }
          if (++count >= 120) return closeStream();
          if (!closed) timer = timers.setTimeout(() => { const job = tick(); pending.add(job); void job.finally(() => pending.delete(job)); },
            streamIntervalMs ?? (service.capabilities().streamingQuotes ? 5000 : 60000));
        };
        const job = tick(); pending.add(job); void job.finally(() => pending.delete(job)); return;
      }
      check(method === 'POST', 'method_not_allowed');
      check(['/profile', '/research', '/plan', '/execute', '/reconcile'].includes(route), 'route_not_found');
      let body = request.body;
      if (body === undefined) {
        let bytes = 0; const chunks = [];
        for await (const chunk of request) { const buffer = Buffer.from(chunk); bytes += buffer.length; check(bytes <= 65536, 'body_too_large'); chunks.push(buffer); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { check(false, 'invalid_json'); }
      }
      check(body && typeof body === 'object' && !Array.isArray(body) && Buffer.byteLength(JSON.stringify(body)) <= 65536, 'invalid_body');
      check(authenticate(request, scope) === tenant, 'unauthorized');
      if (route === '/profile') return send(200, service.saveProfile(tenant, body));
      if (route === '/research') return send(200, await service.research(tenant, body));
      if (route === '/plan') return send(200, await service.plan(tenant, body.strategies));
      if (route === '/execute') return send(200, await service.execute(tenant, id(body.planHash, 'plan_hash')));
      check(typeof service.reconcile === 'function', 'reconciliation_unavailable');
      return send(200, await service.reconcile(tenant, id(body.planHash, 'plan_hash')));
    } catch (error) {
      if (closeStream) return closeStream();
      if (response.destroyed) return;
      const code = error.code || 'request_failed'; response.statusCode = statusFor(code);
      if (response.statusCode === 429) response.setHeader('Retry-After', '60');
      response.end(JSON.stringify({ error: code, action: 'HOLD', quantity: '0' }));
    }
  }
  const handler = (request, response) => {
    const job = handle(request, response); pending.add(job);
    void job.finally(() => pending.delete(job)); return job;
  };
  handler.close = async () => { closing = true; for (const close of [...streams]) close(); await Promise.allSettled([...pending]); };
  return handler;
}
