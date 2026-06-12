# Architecture Review — Stocks Optimizer → Hedge-Fund Reference

> **Status**: ✅ IMPLEMENTED — Layer files created, backward compatibility preserved
> **Date**: 2025-06-11
> **Scope**: `examples/stocks-optimizer/`

---

## Phase 0 — Current Architecture

### 0.1 Architecture Map

```
src/artifacts/api-server/src/lib/
├── stock-data.ts                    ← GOD FILE (2879 lines)
├── signal-lifecycle-governance.ts   ← Model lifecycle (DB)
├── signal-training.ts              ← Adaptive thresholds (DB)
└── logger.ts                       ← Logging
```

### 0.2 Data Flow (Current)

```
HTTP Request → stocks.ts
  → fetchQuotes() → fetchQuote() → [Binance|TradingView] → StockQuote (raw)
  → attachSignalsToQuotes()
    → getSignalForQuote()
      → getSignalTrainingState() [DB]
      → createSignalDecision()
        → evaluateNodeEcuSignal() [EXT] OR deriveHeuristicSignal() [ALPHA]
        → calibrateSignalDecision() [TRAINING]
      → governSignalForQuote()
        → governSignalDecision() [DB R/W] — CAN FORCE HOLD, SET ALLOCATION
        → applyLifecycleToSignal()
      → recordSignalSnapshot() [DB WRITE]
  → enrichAdaptiveQuote()
    → deriveRegime(), deriveLifecycleState()
    → compute liveMetrics (Sharpe, Sortino, hitRate, drawdown)
    → compute diagnostics (entropy, drift, predictionResidual)
  → StockQuote (ENRICHED — everything mixed)
  → HTTP Response
```

### 0.3 Responsibility Map

| Responsibility | Location | Problem |
|---|---|---|
| Market data fetching | `stock-data.ts` | Mixed with signal logic |
| Symbol normalization | `stock-data.ts` (~400 lines) | Mixed with everything |
| Rate limiting | `stock-data.ts` | Infrastructure in data file |
| Caching | `stock-data.ts` (6+ caches) | Infrastructure in data file |
| Alpha generation (heuristic) | `stock-data.ts` `deriveHeuristicSignal()` | Core alpha buried in God file |
| Alpha generation (ML) | `stock-data.ts` `evaluateNodeEcuSignal()` | External API mixed with data |
| Signal calibration | `signal-training.ts` | Clean — already separated |
| Signal governance | `signal-lifecycle-governance.ts` | **Mixed**: portfolio control + signal modification |
| Regime detection | `stock-data.ts` `deriveRegime()` | Portfolio/risk concern in data file |
| Portfolio metrics | `stock-data.ts` `enrichAdaptiveQuote()` | Portfolio concern in data file |
| Lifecycle state | `stock-data.ts` `deriveLifecycleState()` | Portfolio concern in data file |
| Spread estimation | `stock-data.ts` `estimateSpread()` | Execution concern in data file |
| Impact assessment | `stock-data.ts` `buildImpact()` | Risk/execution concern in data file |
| Diagnostics | `stock-data.ts` `enrichAdaptiveQuote()` | Monitoring concern in data file |

### 0.4 Key Findings

1. **God File** — `stock-data.ts` is 2879 lines mixing 7+ concerns
2. **Signal controls money** — `governSignalDecision()` forces Hold and sets `modelAllocationMultiplier`
3. **No Portfolio & Risk layer** — Portfolio decisions scattered across 3 files
4. **No Execution layer** — System stops at enriched quotes
5. **Mega-type** — `StockQuote` carries raw data + signals + lifecycle + metrics + diagnostics
6. **Hybrid governance** — `signal-lifecycle-governance.ts` mixes portfolio control with signal modification

---

## Phase 1 — Architecture Review

### Candidate A: "Thin Slices" — File Split Only

Split `stock-data.ts` into files by concern. Keep `StockQuote` mega-type. No new types.

| Criterion | Score |
|---|---|
| Simplicity | ★★★★★ |
| Maintainability | ★★★ |
| Signal philosophy | ★★ |
| Hedge-fund compat | ★★ |
| Reliability | ★★★★★ |
| Migration ease | ★★★★★ |
| **Total** | **19/30** |

❌ Signal still controls money. No layer contracts. Doesn't express pipeline.

### Candidate B: "Pipeline" — Full Horizontal Decomposition

Nested directories per layer. Typed contracts. Full pipeline types.

| Criterion | Score |
|---|---|
| Simplicity | ★★★ |
| Maintainability | ★★★★ |
| Signal philosophy | ★★★★ |
| Hedge-fund compat | ★★★★ |
| Reliability | ★★★ |
| Migration ease | ★★ |
| **Total** | **21/30** |

❌ Over-engineered for example app. Heavy migration. Too many directories.

### Candidate C: "Adaptive Pipeline" — Pragmatic Layered Decomposition

Flat layer files with typed contracts. Backward-compatible `StockQuote`. Pipeline orchestration.

| Criterion | Score |
|---|---|
| Simplicity | ★★★★ |
| Maintainability | ★★★★ |
| Signal philosophy | ★★★★ |
| Hedge-fund compat | ★★★★ |
| Reliability | ★★★★ |
| Migration ease | ★★★★ |
| **Total** | **24/30** |

✅ Best balance. Clear pipeline. Signal doesn't control money. Incremental migration.

### Selected: **C — Adaptive Pipeline**

---

## Phase 2 — Target Design

### 2.1 Target Architecture

```
Market Data → Alpha → Portfolio & Risk → Execution → Monitoring
```

Each layer has:
- **Input type**: What it receives from the previous layer
- **Output type**: What it produces for the next layer
- **Single file**: All logic for that layer in one place

### 2.2 Layer Boundaries

#### Market Data Layer (`market-data.ts`)

**Input**: Symbol, exchange, options
**Output**: `MarketQuote`

```typescript
interface MarketQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  changePercent: number;
  status: "Stable" | "Rising" | "Watch" | "Dip";
  high52: number;
  low52: number;
  history: number[];
  quoteSource: "binance-spot" | "binance-futures" | "tradingview";
}
```

**Contains**:
- `fetchQuotes()`, `fetchMarketQuotes()`, `fetchMarketDailyCandles()`
- `fetchQuote()`, `fetchTradingViewRows()`, `fetchBinanceQuote()`
- All symbol normalization functions
- All caching and rate limiting
- `loadStockList()`, `listExchanges()`, `listMarkets()`
- `estimateSpread()` (execution data derived from market data)

**Does NOT contain**: Any signal logic, portfolio logic, or diagnostics

#### Alpha Layer (`alpha.ts`)

**Input**: `MarketQuote`, market context
**Output**: `SignalOpportunity`

```typescript
interface SignalOpportunity {
  symbol: string;
  action: TradeSignal;           // "Buy" | "Hold" | "Sell"
  confidence: number;            // 0-100
  source: "node-ecu" | "heuristic";
  regime: AdaptiveRegime;        // Market regime at signal time
  emittedAt: string;            // ISO timestamp
  entryPrice: number;           // Price when signal was generated
}
```

**Contains**:
- `deriveHeuristicSignal()` — **PRESERVED EXACTLY** (core alpha)
- `evaluateNodeEcuSignal()` — external ML alpha
- `createSignalDecision()` — alpha pipeline entry
- `generateSignalOpportunity()` — converts quote → SignalOpportunity
- `deriveRegime()` — regime at signal time (alpha context)

**Does NOT contain**: Portfolio decisions, allocation, lifecycle governance, metrics

**Key invariant**: Alpha outputs opportunities. It does NOT control money.

#### Portfolio & Risk Layer (`portfolio-risk.ts`)

**Input**: `SignalOpportunity`, `MarketQuote`, training state
**Output**: `PositionDecision`

```typescript
interface PositionDecision {
  symbol: string;
  direction: TradeSignal;              // After portfolio governance
  confidence: number;                  // After portfolio governance
  allocationMultiplier: number;        // 0.0 - 1.0
  canOpenNewTrades: boolean;
  lifecycleState: SignalLifecycle;     // EMITTED | ACTIVE | DECAYING | INVALIDATED | COMPLETED
  modelId: string;
  modelLifecycleState: string;         // RESEARCH | WATCHLIST | PROVEN | RETIRED
  modelLifecycleAction: string;        // Awaiting Decision | Careful | Trusted | Disregard
  liveMetrics: {
    rollingSharpe: number;
    rollingSortino: number;
    hitRate: number;
    expectancy: number;
    profitFactor: number;
    maxDrawdown: number;
  };
}
```

**Contains**:
- `evaluatePosition()` — main entry: opportunity → PositionDecision
- `deriveLifecycleState()` — signal lifecycle tracking
- Portfolio metrics computation (Sharpe, Sortino, hitRate, drawdown, profitFactor)
- `governSignalDecision()` — **MOVED HERE** from signal-lifecycle-governance.ts
- `applyLifecycleToSignal()` — **MOVED HERE**, applies portfolio constraints to signals

**Does NOT contain**: Alpha generation, market data fetching, diagnostics

**Key invariant**: Portfolio & Risk is the SINGLE authority for sizing, exposure, and allocation. Signal cannot bypass this layer.

#### Execution Layer (`execution.ts`)

**Input**: `PositionDecision`, `MarketQuote`
**Output**: `ExecutionAssessment`

```typescript
interface ExecutionAssessment {
  symbol: string;
  summary: string;           // Human-readable summary
  impact: string;            // Risk/impact assessment text
  spread: { bid: number; ask: number };
}
```

**Contains**:
- `assessExecution()` — main entry: position + quote → ExecutionAssessment
- `buildSummary()` — human-readable summary
- `buildImpact()` — risk/impact text

**Does NOT contain**: Signal logic, portfolio logic, market data fetching

#### Monitoring Layer (`monitoring.ts`)

**Input**: `MarketQuote`, `SignalOpportunity`, `PositionDecision`
**Output**: `DiagnosticsSnapshot`

```typescript
interface DiagnosticsSnapshot {
  entropy: number;
  featureDrift: number;
  predictionResidual: number;
  volatilityShift: number;
  stabilityScore: number;
  driftScore: number;
  uncertainty: number;
  featureConsensus: number;
  ensembleAgreement: number;
  expectedMovePct: number;
}
```

**Contains**:
- `computeDiagnostics()` — main entry: all inputs → DiagnosticsSnapshot
- All diagnostic computation functions

**Does NOT contain**: Any decision logic

#### Pipeline Orchestration (`pipeline.ts`)

**Input**: Raw quotes + market context
**Output**: Enriched `StockQuote` (backward compatible)

**Contains**:
- `enrichQuoteWithPipeline()` — runs full pipeline for a single quote
- `attachSignalsToQuotes()` — **PRESERVED** as public API, now delegates to pipeline
- Adapter logic to compose layer outputs into `StockQuote`

**Key invariant**: This is the ONLY place where all layers are composed. Each layer is independently callable.

#### Shared Types (`types.ts`)

**Contains**:
- `StockQuote` — **PRESERVED** for backward compatibility (frontend still consumes this)
- `TradeSignal`, `AdaptiveRegime`, `SignalLifecycle` — shared enums
- `StockListItem`, `MarketDailyCandle` — market data types
- All cache types and option types

### 2.3 Target Data Flow

```
HTTP Request → stocks.ts
  │
  ├─► market-data.fetchQuotes() → MarketQuote[]
  │
  ├─► For each MarketQuote:
  │     │
  │     ▼
  │   alpha.generateSignalOpportunity(quote, market) → SignalOpportunity
  │     │
  │     ▼
  │   portfolio-risk.evaluatePosition(opportunity, quote, trainingState) → PositionDecision
  │     │
  │     ▼
  │   execution.assessExecution(position, quote) → ExecutionAssessment
  │     │
  │     ▼
  │   monitoring.computeDiagnostics(quote, opportunity, position) → DiagnosticsSnapshot
  │     │
  │     ▼
  │   pipeline.composeEnrichedQuote(quote, opportunity, position, assessment, diagnostics)
  │     → StockQuote (backward compatible)
  │
  ▼
HTTP Response (StockQuote[])
```

### 2.4 What Changes for Each Layer

| Layer | Before | After |
|---|---|---|
| Market Data | Buried in `stock-data.ts` | Isolated in `market-data.ts` |
| Alpha | `deriveHeuristicSignal()` in God file | Isolated in `alpha.ts`, outputs `SignalOpportunity` |
| Portfolio & Risk | Scattered across 3 files | Single authority in `portfolio-risk.ts` |
| Execution | `estimateSpread()`, `buildImpact()` in God file | Isolated in `execution.ts` |
| Monitoring | Diagnostics in `enrichAdaptiveQuote()` | Isolated in `monitoring.ts` |
| Governance | Modifies signals directly | Portfolio layer applies constraints; alpha stays pure |
| `StockQuote` | Mega-type with everything | Composition target — assembled from layer outputs |

### 2.5 What Does NOT Change

- `signal-training.ts` — untouched
- `signal-lifecycle-governance.ts` — refactored (portfolio decisions move to `portfolio-risk.ts`)
- `signal-trace/` — untouched
- `signal-markets/` — untouched
- `stocks.ts` (routes) — minimal change (import path updates)
- `signal-webhooks.ts` — minimal change (import path updates)
- `signal-api.test.ts` — preserved, import paths updated
- Frontend — zero changes (still receives `StockQuote`)

---

## Phase 3 — Implementation Plan

### 3.1 Folder Structure Changes

```
src/artifacts/api-server/src/lib/
├── types.ts                        ← NEW: shared types extracted from stock-data.ts
├── market-data.ts                  ← NEW: market data layer (from stock-data.ts)
├── alpha.ts                        ← NEW: alpha layer (from stock-data.ts)
├── portfolio-risk.ts               ← NEW: portfolio & risk layer (from stock-data.ts + governance)
├── execution.ts                    ← NEW: execution layer (from stock-data.ts)
├── monitoring.ts                   ← NEW: monitoring layer (from stock-data.ts)
├── pipeline.ts                     ← NEW: pipeline orchestration
├── stock-data.ts                   ← DEPRECATED: re-exports from pipeline.ts for backward compat
├── signal-lifecycle-governance.ts  ← MODIFIED: portfolio decisions extracted to portfolio-risk.ts
├── signal-training.ts              ← UNTOUCHED
└── logger.ts                       ← UNTOUCHED
```

### 3.2 Migration Plan (6 Steps)

#### Step 1: Extract `types.ts`
- Move all type definitions from `stock-data.ts` to `types.ts`
- `StockQuote`, `StockListItem`, `TradeSignal`, `AdaptiveRegime`, `SignalLifecycle`
- `MarketDailyCandle`, `QuoteFetchOptions`, `SignalAttachOptions`
- All cache types, `SignalSnapshot`, `SignalDecision`
- `stock-data.ts` re-exports from `types.ts` — zero breaking changes

#### Step 2: Extract `market-data.ts`
- Move all market data fetching functions from `stock-data.ts`
- `fetchQuotes`, `fetchMarketQuotes`, `fetchMarketDailyCandles`, `fetchQuote`
- `fetchTradingViewRows`, `fetchBinanceQuote`, all Binance/TradingView helpers
- All symbol normalization functions
- All caching and rate limiting infrastructure
- `loadStockList`, `listExchanges`, `listMarkets`, `loadMarketList`
- `estimateSpread` (stays with market data — derived from price/history)
- `stock-data.ts` re-exports from `market-data.ts` — zero breaking changes

#### Step 3: Extract `alpha.ts`
- Move alpha generation functions from `stock-data.ts`
- `deriveHeuristicSignal` — **PRESERVED EXACTLY**
- `evaluateNodeEcuSignal`, `buildNodeEcuInput`, `mapIntentToTradeSignal`
- `createSignalDecision`, `deriveRegime` (regime is alpha context)
- Add new `generateSignalOpportunity()` that wraps existing logic
- `stock-data.ts` re-exports — zero breaking changes

#### Step 4: Extract `portfolio-risk.ts`
- Move portfolio/risk functions from `stock-data.ts`
- `deriveLifecycleState`, `enrichAdaptiveQuote` (metrics portion)
- All liveMetrics computation (Sharpe, Sortino, hitRate, etc.)
- Move portfolio decisions from `signal-lifecycle-governance.ts`
- `governSignalDecision` → called by portfolio-risk, not by alpha
- `applyLifecycleToSignal` → called by portfolio-risk, not by alpha
- Add new `evaluatePosition()` that wraps the flow
- `signal-lifecycle-governance.ts` keeps `governSignalDecision` but it's called BY portfolio-risk, not by alpha

#### Step 5: Extract `execution.ts` and `monitoring.ts`
- `execution.ts`: `buildSummary`, `buildImpact`, `assessExecution()`
- `monitoring.ts`: All diagnostics from `enrichAdaptiveQuote`, `computeDiagnostics()`

#### Step 6: Create `pipeline.ts` and deprecate `stock-data.ts`
- `pipeline.ts`: `enrichQuoteWithPipeline()`, `attachSignalsToQuotes()`
- `stock-data.ts` becomes a thin re-export module for backward compatibility
- Update `stocks.ts` and `signal-webhooks.ts` imports

### 3.3 Files to Modify

| File | Change |
|---|---|
| `stock-data.ts` | Becomes thin re-export module |
| `signal-lifecycle-governance.ts` | Portfolio decisions called by portfolio-risk, not alpha |
| `stocks.ts` | Import path updates |
| `signal-webhooks.ts` | Import path updates |

### 3.4 Files to Create

| File | Content source |
|---|---|
| `types.ts` | Type definitions from `stock-data.ts` |
| `market-data.ts` | Market data functions from `stock-data.ts` |
| `alpha.ts` | Alpha functions from `stock-data.ts` |
| `portfolio-risk.ts` | Portfolio functions from `stock-data.ts` + governance |
| `execution.ts` | Execution functions from `stock-data.ts` |
| `monitoring.ts` | Diagnostics from `stock-data.ts` |
| `pipeline.ts` | New orchestration layer |

### 3.5 Files to Keep Untouched

- `signal-training.ts`
- `logger.ts`
- `signal-trace/` (all files)
- `signal-markets/` (all files)
- `signal-api.test.ts` (only import paths updated)

### 3.6 Dependency Changes

No new npm dependencies. All changes are internal file reorganization.

### 3.7 Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Import path breakage | Medium | High | `stock-data.ts` re-exports everything during migration |
| Alpha behavior change | Low | Critical | `deriveHeuristicSignal()` preserved exactly — copy, don't rewrite |
| Frontend breakage | Low | High | `StockQuote` type preserved; pipeline assembles it identically |
| Test breakage | Medium | Medium | Tests import from `stock-data.ts` which re-exports |
| Circular imports | Low | High | Layer files import from `types.ts` only, not from each other |
| Performance regression | Low | Medium | Same functions, same caches, just different files |

### 3.8 Validation Plan

1. **Type check**: `tsc --noEmit` passes after each step
2. **Existing tests**: `signal-api.test.ts` passes after each step
3. **Alpha preservation**: `deriveHeuristicSignal()` output is identical for same inputs
4. **Frontend compatibility**: `StockQuote` shape is unchanged in HTTP responses
5. **Layer isolation**: Each layer file can be imported independently
6. **No circular imports**: `dependency-cruiser` passes

---

## Phase 4–5 — Implementation & Verification

Implementation proceeds incrementally through the 6 migration steps defined in Phase 3.

After each step:
1. Run type check
2. Run existing tests
3. Verify no behavioral change
4. Commit

Final verification:
1. ✅ Existing signals still generate correctly (`deriveHeuristicSignal` preserved)
2. ✅ Portfolio decisions occur exclusively in Portfolio & Risk layer
3. ✅ Execution consumes positions, not raw signals
4. ✅ Responsibility boundaries are clear (one file per layer)
5. ✅ Architecture is simpler than before (no God file)
6. ✅ No unnecessary abstractions (flat files, typed contracts, backward compat)
