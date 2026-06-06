module.exports = function handler(_req, res) {
  try {
    const mod = require("../src/artifacts/api-server/dist/app.cjs");
    const app = mod.default || mod;

    res.status(200).json({
      ok: true,
      keys: Object.keys(mod),
      hasDefault: Boolean(mod.default),
      appType: typeof app
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
  }
};
