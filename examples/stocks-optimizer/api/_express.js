const serverless = require("serverless-http");

let cachedHandler;

function getExpressHandler() {
  if (!cachedHandler) {
    const mod = require("../src/artifacts/api-server/dist/app.cjs");
    const app = mod.default || mod;
    cachedHandler = serverless(app);
  }

  return cachedHandler;
}

function createRouteHandler(expressPath) {
  return function handler(req, res) {
    const queryIndex = req.url.indexOf("?");
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";

    req.url = `${expressPath}${query}`;
    req.originalUrl = req.url;

    return getExpressHandler()(req, res);
  };
}

module.exports = {
  createRouteHandler,
};
