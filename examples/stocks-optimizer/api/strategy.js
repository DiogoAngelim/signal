const { getExpressHandler } = require('./_express.js');
/** Consolidate the obsolete handler; its old job variables and promotion path were unsafe. */
module.exports = function strategy(req, res) {
  const query = new URL(req.url || '/', 'http://localhost').search;
  const action = String(req.body?.action || new URLSearchParams(query).get('action') || '');
  if (['optimize-market','backtest-market','forward-validate','cron-optimize','cron-backtest','cron-forward-validate','cron-walk-forward','create-job','run-job','claim-next-job','set-control','force-cash'].includes(action)) {
    res.status(410).json({ error: 'legacy_strategy_mutation_retired', migration: '/api/investing/research', liveTradingApproved: false });
    return;
  }
  req.url = `/api/strategy${query}`; req.originalUrl = req.url;
  return getExpressHandler()(req, res);
};
