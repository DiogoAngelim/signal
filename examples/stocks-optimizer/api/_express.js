let cachedHandler;

function getExpressHandler() {
  if (!cachedHandler) {
    const mod = require("../src/artifacts/api-server/dist/app.cjs");
    cachedHandler = mod.default || mod;
  }

  return cachedHandler;
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

    return getExpressHandler()(req, res);
  };
}

module.exports = {
  createRouteHandler,
  getExpressHandler,
};
