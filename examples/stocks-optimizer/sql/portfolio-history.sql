CREATE TABLE IF NOT EXISTS stock_price_history (
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC NOT NULL,
  adj_close NUMERIC,
  volume NUMERIC,
  source TEXT NOT NULL DEFAULT 'tradingview-data',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market, symbol, date)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  allocation_action TEXT NOT NULL,
  suggested_exposure NUMERIC NOT NULL DEFAULT 0,
  setup_quality NUMERIC,
  risk_pressure NUMERIC,
  expected_move NUMERIC,
  signal_action TEXT,
  signal_status TEXT,
  price NUMERIC,
  source TEXT NOT NULL DEFAULT 'signal-engine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market, symbol, date)
);

CREATE TABLE IF NOT EXISTS portfolio_equity_curve (
  market TEXT NOT NULL,
  date DATE NOT NULL,
  equity NUMERIC NOT NULL,
  return_pct NUMERIC NOT NULL,
  deployed_pct NUMERIC NOT NULL,
  cash_pct NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market, date)
);

CREATE TABLE IF NOT EXISTS portfolio_metrics (
  market TEXT PRIMARY KEY,
  total_return_pct NUMERIC,
  annualized_sharpe NUMERIC,
  average_duration_days NUMERIC,
  profit_factor NUMERIC,
  win_rate_pct NUMERIC,
  max_drawdown_pct NUMERIC,
  equity NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_price_history_symbol_date
  ON stock_price_history (market, symbol, date);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_market_date
  ON portfolio_snapshots (market, date);

CREATE INDEX IF NOT EXISTS idx_portfolio_equity_curve_market_date
  ON portfolio_equity_curve (market, date);
