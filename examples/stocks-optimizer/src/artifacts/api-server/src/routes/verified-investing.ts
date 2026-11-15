import { Router } from 'express';
import { once } from 'node:events';
const router = Router();
const allowed = new Set(['/capabilities','/report','/signals','/stream','/profile','/research','/plan','/execute']);
/** Forward only explicitly configured internal service routes; never grant a caller additional credentials. */
router.use(async (req, res) => {
  const path = req.path;
  if (!allowed.has(path)) { res.status(404).json({ error: 'route_not_found' }); return; }
  const configured = process.env.VERIFIED_INVESTING_INTERNAL_URL;
  if (!configured) { res.status(503).json({ error: 'verified_investing_worker_not_configured', action: 'HOLD', quantity: '0' }); return; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === '/stream' ? 120000 : 45000);
  const abort = () => controller.abort(); res.on('close', abort);
  try {
    const target = new URL(configured);
    if (target.username || target.password || target.hash || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(target.hostname)))) throw Error('invalid_worker_origin');
    target.pathname = `/api/investing${path}`;
    target.search = new URL(req.originalUrl, 'http://localhost').search;
    const upstream = await fetch(target, { method: req.method, redirect: 'error', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: String(req.headers.authorization || ''), accept: path === '/stream' ? 'text/event-stream' : 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined });
    res.status(upstream.status); res.setHeader('Content-Type', path === '/stream' ? 'text/event-stream' : 'application/json'); res.setHeader('Cache-Control','no-store');
    if (!upstream.body) { res.end(); return; }
    const reader = upstream.body.getReader(); let bytes = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength;
      if (bytes > 4000000) { await reader.cancel(); throw Error('worker_response_limit'); }
      if (!res.write(Buffer.from(value))) await once(res, 'drain', { signal: controller.signal });
    } } finally { reader.releaseLock(); }
    res.end();
  } catch {
    if (!res.headersSent) res.status(503).json({ error: 'verified_investing_unavailable', action: 'HOLD', quantity: '0' });
    else res.end();
  } finally { clearTimeout(timer); res.off('close', abort); }
});
export default router;
