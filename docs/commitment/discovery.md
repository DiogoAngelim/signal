# Commitment Discovery Report

## Scope

Risk Divider was inspected as the reference implementation at `rd-app-main/`. Generated bundles, `node_modules`, platform build products, images, and vendor chart libraries were excluded from semantic review. The reusable behavior is concentrated in:

- `services/optimizer-api/lib/optimizer.js`
- `services/optimizer-api/lib/market-data.js`
- `services/optimizer-api/api/optimize.js`
- `app/src/renderer/lib/optimizePortfolio.ts`
- `app/src/renderer/lib/rebalancePortfolio.ts`
- `src/api.ts`
- `src/optimizer.ts`
- `app/python/ai.py`
- `app/src/assets-api-wasm/src/lib.rs`
- dashboard metric components that compute diversification, volatility, Sharpe-like reward, and drawdown

## What Risk Divider Solves

Risk Divider solves this finance-specific problem:

Given a selected market, a set of chosen assets, historical price data, current quantities, and optional cash, recommend target allocation weights and rebalance actions that improve risk-adjusted behavior.

The generic hidden capability is:

Given multiple candidate commitments, evidence about their historical outcomes, trust/confidence, and constraints, recommend how much of a limited resource should be committed to each candidate.

## Architecture Found

| Area | Source | Behavior |
| --- | --- | --- |
| Market data loading | `market-data.js`, `src/api.ts`, `fetchAssets.ts`, WASM Rust loader | Fetch stock lists and price history, cache results, parse CSV/JSON/chart payloads, normalize symbols, align histories. |
| Return construction | optimizer files and Optimize page | Convert prices to simple daily changes or log returns, align common periods, replace missing/invalid values. |
| Portfolio metrics | optimizer files, `PerformanceMetrics.tsx` | Compute weighted outcome series, annualized return, volatility, downside deviation, cumulative return, max drawdown, Sharpe, Sortino, Calmar, diversification via `1 - HHI`. |
| Optimization engine | `optimizer.js`, `optimizePortfolio.ts` | Generate random long-only normalized weights, score them, keep best, refine around best weights, return normalized target weights. |
| Objective scoring | `optimizer.js` | Supports Sharpe, Sortino, Calmar, return, and composite objective. Composite weights: Sharpe 0.8, Sortino 0.15, return 0.45, drawdown 0.35, volatility 0.04. |
| Tie-breaking | `optimizer.js` | Prefer higher Sharpe, then higher cumulative return, then lower drawdown, then lower volatility. |
| Rebalance actions | `rebalancePortfolio.ts`, `src/optimizer.ts` | Convert target weights plus cash/current holdings into buy/sell actions. Uses whole-share floor and optional sell permission. |
| Remote optimizer API | `api/optimize.js`, `market-data.js` | GET/POST endpoint validates exchange/symbols, loads aligned price data, returns `optimal_weights`. |
| AI experiment | `app/python/ai.py` | Trains a small PyTorch actor network with softmax weights and Sharpe loss. Outputs `optimal_weights`. Not wired as the primary production path. |
| Heuristic suggestions | `src/api.ts` | Fetch weekly portfolio suggestions and convert symbols to local asset objects. |

## Mathematical Models And Algorithms

1. Positive weight normalization
   - Negative or invalid weights are clipped to zero.
   - Weights are divided by their positive sum.
   - Generic equivalent: normalize candidate commitment shares.

2. Random simplex search
   - Draws exponential random values using `-log(Math.random())`.
   - Normalizes to a long-only weight vector.
   - Repeats for configured rounds, then refines around the best candidate.
   - Generic equivalent: deterministic seeded search over possible commitment distributions.

3. Reward to variability metrics
   - Weighted period outcomes are aggregated into a portfolio series.
   - Volatility and downside deviation are annualized with 252 periods per year.
   - Max drawdown is calculated from compounded returns.
   - Generic equivalent: outcome reward, downside sensitivity, variability, and deterioration.

4. Composite scoring
   - Score can optimize Sharpe-like, downside-adjusted, drawdown-adjusted, return-only, or a composite blend.
   - Generic equivalent: configurable strategy objective.

5. Concentration and diversification
   - UI computes `1 - sum(weight^2)` as diversification.
   - Generic equivalent: concentration limit and commitment spread.

6. Rebalance sizing
   - Converts target percentages into units with `floor(allocation / price)`.
   - Buy-only mode scales unmet target buys to available cash.
   - Generic equivalent: outside Signal. Exact units belong to Stocks Optimizer.

7. PPO-like actor model
   - Reads local CSVs, trains a softmax actor to maximize mean/std of weighted returns.
   - Generic equivalent: not migrated. It is an experimental optimizer family, not required for the stable commitment abstraction.

## Assumptions

### Finance-Specific Assumptions

- Candidates are stocks, crypto, forex, ETFs, or market-listed assets.
- Inputs are exchanges, symbols, CSV price histories, close prices, quantities, and cash.
- There are 252 periods per year.
- All commitments are long-only.
- Allocation output is a portfolio weight vector that sums to 1.
- Execution units are whole shares.
- Rebalance can buy or sell based on current holdings.
- Remote market data and optimizer endpoints are available.
- No transaction cost, tax, slippage, liquidity, lot-size, borrowing, or broker constraint is modeled.

### Generic Assumptions

- A decision can be represented as candidates competing for a bounded resource.
- Confidence and trust should reduce commitment before execution.
- Constraints can block, cap, or reduce commitment.
- A positive decision does not imply maximum commitment.
- Outcome history can be scored by reward relative to variability.
- Allocation strategies should be swappable.
- Results must explain what limited the recommendation.
- Results should include invalidation and monitoring guidance.

### Assumptions To Remove From Signal

- Market, exchange, asset class, symbol, price, share, portfolio, broker, currency, and API-specific concepts.
- `Math.random()` nondeterminism.
- UI, Electron, iOS, local file cache, and remote fetch behavior.
- Whole-share floor sizing.
- Finance-specific words in the core abstraction.

### Assumptions To Make Configurable Policies

- Confidence and trust thresholds.
- Total commitment caps.
- Per-target concentration caps.
- Constraint reductions by severity.
- Risk tolerance.
- Objective weights for `sharpe_like`.
- Fallback behavior when data is missing.
- Invalidation tolerance.
- Monitoring sensitivity.

### Assumptions That Belong In Stocks Optimizer

- Symbols, exchanges, market suffixes, quote currencies, and price histories.
- Capital, portfolio value, current positions, exact units, and whole/fractional unit rules.
- Transaction costs, taxes, liquidity, broker rules, order routing, and execution.
- Market data caching and symbol resolution.
- Conversion from abstract commitment amount to exact buy/sell actions.

## Migration Decision

Risk Divider should not be ported as a finance framework. Signal should absorb only the generic commitment capability:

Decision + trust + constraints + resource + strategy + policy -> recommended commitment + explanation + invalidation + monitoring.

The current Sharpe optimizer maps to one strategy named `sharpe_like`. It is not the commitment framework itself.
