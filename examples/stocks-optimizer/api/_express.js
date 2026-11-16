let cachedHandlerPromise;

// Load the native ESM app without converting ESM-only auth libraries to CJS.
function getExpressHandler() {
  if (!cachedHandlerPromise) {
    cachedHandlerPromise = import("../src/artifacts/api-server/dist/app.mjs")
      .then((mod) => mod.default || mod).catch((error) => {
        cachedHandlerPromise = null;
        throw error;
      });
  }
  return cachedHandlerPromise;
}

function createRouteHandler(expressPath) {
  return function handler(req, res) {
    const rawUrl = req.url ?? "";
    const queryIndex = rawUrl.indexOf("?");
    const path = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";

    if (path === expressPath || path.startsWith(`${expressPath}/`)) {
      req.url = `${path}${query}`;
    } else {
      req.url = `${expressPath}${path}${query}`;
    }
    req.originalUrl = req.url;

    return getExpressHandler().then((app) => app(req, res)).catch(() => {
      if (!res.headersSent) res.status(503).json({ error: { code: "backend_unavailable" } });
    });
  };
}

module.exports = {
  createRouteHandler,
  getExpressHandler,
};
