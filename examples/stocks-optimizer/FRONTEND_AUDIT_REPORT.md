# Stocks Optimizer — Frontend Architecture & Runtime Behavior Audit

**Date:** 2026-06-12  
**Scope:** `examples/stocks-optimizer/src/artifacts/signal-markets/` + supporting lib/packages  
**Verdict:** **ARCHITECTURE BROKEN**

---

## Executive Summary

The Stocks Optimizer frontend is **not a snapshot renderer**. It runs the full `signal-framework` domain engine inside the browser, computes allocation decisions, classifies market regimes, evaluates position sizing, assesses data reliability, and derives intelligence scores — all independently of the backend. There is no `/signal-client` abstraction. The single Dashboard component (~10,000+ lines) holds 30+ `useState` hooks and 20+ `useMemo` derived computations, creating a fragmented, mutable, non-atomic state model. The frontend is a second source of truth, not a renderer of backend truth.

---

## 1. ARCHITECTURE COMPLIANCE

### Verdict: **NON-COMPLIANT**

| Rule | Status | Evidence |
|------|--------|----------|
| `/signal-client` exists as sole backend entry point | ❌ VIOLATED | No `/signal-client` exists. Frontend uses `@/lib/api.ts` with 13+ direct `fetch()` calls |
| No direct API calls outside signal-client | ❌ VIOLATED | `fetchMarkets`, `fetchStockList`, `fetchStockQuoteBatch`, `registerSignalWatchlist`, `fetchSignalHistory`, `fetchModelLifecycle`, `fetchModelLifecycleAudit`, `createModelLifecycleCandidate`, `fetchPortfolioDecisionMemory`, `fetchPortfolioDecisionAudit`, `fetchPortfolioDecisionOutcomes`, `recordPortfolioDecisionMemory`, `reviewPortfolioDecisionOutcomes` |
| No duplicate state layer | ❌ VIOLATED | Dual API client: `@workspace/api-client-react` (workspace pkg, unused) AND `signal-markets/src/lib/api.ts` (local, used). Plus 30+ useState, useRef, useMemo state fragments |
| Frontend is snapshot renderer only | ❌ VIOLATED | Frontend runs `SignalFrameworkEngine.cycleOnce()`, `sizeAdaptiveOpportunity()`, `evaluateViability()`, `classifyMarketRegime()`, `decideMetaAllocation()`, `evaluateMarketReliability()`, `evaluateLearningJudgment()` |

### Explicit Violations

1. **V-01**: No `/signal-client` — 13 raw API functions in `api.ts`
2. **V-02**: `api-client-react` workspace package exists but is unused by the main frontend
3. **V-03**: Frontend imports and executes `signal-framework` domain engine directly
4. **V-04**: Frontend computes allocation actions via `deriveAllocationAction()`
5. **V-05**: Frontend runs `MarketStateEngine` (full perception cycle) in browser
6. **V-06**: Frontend maintains mutable module-level state (`RollingCalibrationTracker` singleton)

---

## 2. STATE MODEL ANALYSIS

### Intended: Single immutable snapshot replaced atomically  
### Actual: Fragmented mutable state across 30+ hooks + caches + singletons

| State Layer | Location | Type | Mutable? | Atomic? |
|-------------|----------|------|----------|---------|
| `markets` | `useState` | `MarketOption[]` | ✅ | ❌ |
| `stocks` | `useState` | `DisplayStock[]` | ✅ | ❌ |
| `portfolioSummary` | `useState` | `any` | ✅ | ❌ |
| `backtestSummary` | `useState` | `any` | ✅ | ❌ |
| `strategySignals` | `useState` | `any[]` | ✅ | ❌ |
| `strategyRegime` | `useState` | `any` | ✅ | ❌ |
| `marketPerceptionSnapshot` | `useState` | `MarketStateSnapshot` | ✅ | ❌ |
| `opportunityDiscovery` | `useState` | `any` | ✅ | ❌ |
| `agencyDiagnostics` | `useState` | `any` | ✅ | ❌ |
| `marketDataByMarketRef` | `useRef` | `Map<string, any>` | ✅ | ❌ |
| `stockVisualMap` | `useState` | `Map<string, any>` | ✅ | ❌ |
| Memory cache | `api.ts` module | `Map<string, CacheEntry>` | ✅ | ❌ |
| Session storage cache | `api.ts` module | `sessionStorage` | ✅ | ❌ |
| `RollingCalibrationTracker` | `metaAllocation.ts` | Singleton with `observations[]` | ✅ | ❌ |
| `MarketStateEngine.history` | `market-perception.ts` | `MarketStateTransition[]` | ✅ | ❌ |

**Key Finding**: No single snapshot model. State is spread across React hooks, module-level singletons, browser storage, and in-memory caches. No part of the state is replaced atomically.

---

## 3. BUSINESS LOGIC LEAK DETECTION

### CRITICAL (Breaks Architecture — Domain logic in frontend)

| # | Logic | File | Function(s) |
|---|-------|------|-------------|
| 1 | Position Sizing | `sizing.ts` | `buildDashboardExposureSizing()`, `sizeAssetExposure()`, `requestedExposureForAsset()` |
| 2 | Viability Evaluation | `sizing.ts` | `evaluateViability()`, `applyViabilityToSizing()` |
| 3 | Regime Classification | `metaAllocation.ts` | `classifyMarketRegime()` |
| 4 | Meta-Allocation Decision | `metaAllocation.ts` | `decideMetaAllocation()` |
| 5 | Survival Forecasting | `metaAllocation.ts` | `forecastSignalSurvival()` |
| 6 | Calibration Tracking | `metaAllocation.ts` | `RollingCalibrationTracker`, `buildCalibrationState()` |
| 7 | Market Reliability | `market-reliability.ts` | `evaluateMarketReliability()` |
| 8 | Market Perception Engine | `market-perception.ts` | `MarketStateEngine.ingest()` → `SignalFrameworkEngine.cycleOnce()` |
| 9 | Semantic State Resolution | `market-perception.ts`, `semantic-metrics.ts` | `resolveSemanticState()`, `buildDashboardSemanticMetrics()` |
| 10 | Learning Judgment | `signal-learning-adapter.ts` | `evaluateStocksLearningJudgment()` |
| 11 | Allocation Action Derivation | `dashboard.tsx` | `deriveAllocationAction()` |
| 12 | Intelligence Inference | `dashboard.tsx` | `inferIntelligence()` |
| 13 | Confidence Gate System | `dashboard.tsx` | `applyBackendBlockersToConfidenceGates()` |
| 14 | Backtest Metrics | `dashboard.tsx` | `metricsFromCurve()` |
| 15 | Regime Consistency | `dashboard.tsx` | `extractRegimeConsistency()` |
| 16 | Execution Presets | `dashboard.tsx` | `executionPresetForMarket()` |

### MODERATE (Indirect Logic Leakage)

| # | Logic | File | Function(s) |
|---|-------|------|-------------|
| 1 | Data Normalization | `dashboard-data-adapter.ts` | `parseDashboardQuoteBatchResponse()`, `parseDashboardStockListResponse()` |
| 2 | Backtest Payload Sanitization | `api.ts` | `sanitizeBacktestApiPayload()`, `protectBacktestApiPayload()` |
| 3 | Promotion State Sanitization | `promotion-sanity.ts` | `sanitizePromotionState()` |

### SAFE (Pure UI Logic)

| # | Logic | File | Function(s) |
|---|-------|------|-------------|
| 1 | Dashboard View State | `dashboard-state.ts` | `resolveDashboardViewState()` |
| 2 | Sizing Mode Labels | `sizing.ts` | `sizingModeLabelForOperator()`, `sizingModeSentenceForOperator()` |
| 3 | Asset Sizing Label | `sizing.ts` | `assetSizingLabel()` |

---

## 4. DATA FLOW TRACE

```
Backend API Server
  ├── /api/stocks/markets
  ├── /api/stocks/list
  ├── /api/stocks/quotes
  ├── /api/stocks/watch-market
  ├── /stocks/signals/history
  ├── /stocks/model-lifecycle
  ├── /stocks/model-lifecycle/audit
  ├── /stocks/portfolio-decisions
  ├── /stocks/portfolio-decisions/audit
  ├── /stocks/portfolio-decisions/outcomes
  └── /api/strategy/*
         │
         ▼
   api.ts request<T>()
   ├── memoryCache (Map)
   ├── sessionStorage
   ├── retry (1x)
   └── Zod parsing (dashboard-data-adapter.ts)
         │
         ▼
   ┌─────────────────────┐
   │  30+ useState        │
   │  10+ useRef          │
   │  20+ useMemo         │
   └─────────┬───────────┘
             │
   ┌─────────┼─────────────────────────┐
   │         │                         │
   ▼         ▼                         ▼
 MarketState  Sizing Functions    MetaAllocation
 Engine        sizeAdaptive-     classifyMarket-
 (signal-      Opportunity()     Regime()
 framework     evaluateViability decideMeta-
 .cycleOnce())                   Allocation()
   │           │                 forecastSignal-
   │           │                 Survival()
   │           │                   │
   └───────────┼──────────────────┘
               ▼
   Dashboard JSX (single 10K+ line component)
   • inferIntelligence()
   • deriveAllocationAction()
   • metricsFromCurve()
   • extractRegimeConsistency()
   • applyBackendBlockersToConfidenceGates()
```

### Where Data Enters
- `fetchMarkets()` → `setMarkets()`
- `fetchStockList()` → `setStocks()`, `setTotalStocks()`
- `fetchStockQuoteBatch()` → merges into `setStocks()`
- Strategy API calls → `setStrategySignals()`, `setStrategyRegime()`
- Portfolio API calls → `setPortfolioSummary()`, `setBacktestSummary()`

### Where Data Transforms
- Raw stocks → `inferIntelligence()` → `IntelligenceStock[]` (setup quality, risk pressure, trend quality, timing quality)
- Intelligence stocks → `deriveAllocationAction()` → `AllocationAction` (Buy/Sell/Hold/Watch/Blocked)
- Raw stocks + market context → `MarketStateEngine.ingest()` → `MarketStateSnapshot`
- Raw stocks + market context → `evaluateMarketReliability()` → `MarketReliabilityResult`
- Intelligence stocks → `sizeAdaptiveOpportunity()` → sized positions
- Market context → `classifyMarketRegime()` → regime label + allocation caps
- Market context → `decideMetaAllocation()` → exposure multiplier, confidence discount

### Where Data is Duplicated
- `stocks` state AND `stockVisualMap` state (parallel maps for same entities)
- `marketDataByMarketRef` caches per-market snapshots alongside React state
- `api.ts` memory cache AND `sessionStorage` cache (dual cache layer)
- `RollingCalibrationTracker` module singleton accumulates observations outside React state
- `MarketStateEngine.history` accumulates transitions outside React state

### Where Inconsistencies May Occur
- `stocks` state updated by quote batch, but `inferIntelligence()` runs on stale `stocksWithStrategySignals` memo
- `strategyRegime` from API vs `classifyMarketRegime()` computed locally may disagree
- `allocationAction` from backend signal vs `deriveAllocationAction()` computed locally may disagree
- `RollingCalibrationTracker` observations persist across market switches without reset
- `marketDataByMarketRef` may hold stale data for non-active markets

---

## 5. SCREEN-BY-SCREEN BEHAVIOR

The application is a single-page dashboard with tab-like sections. All screens share the same fragmented state.

### Home / Dashboard Overview

| Aspect | Detail |
|--------|--------|
| **Data Source** | `fetchMarkets()`, `fetchStockList()`, `fetchStockQuoteBatch()` |
| **Snapshot-Driven?** | ❌ No. Computes `resolveDashboardViewState()` from multiple state fragments |
| **Recomputes/Derives?** | ✅ `marketHealthPct = clamp(avgQuality * 0.55 + (100 - avgRisk) * 0.45)` — health score formula |
| **Consistent?** | ⚠️ Health score uses different formula than `MarketStateSnapshot.compositeScore` |

### Positions / Stock Cards

| Aspect | Detail |
|--------|--------|
| **Data Source** | `stocks` state + `stocksWithStrategySignals` memo |
| **Snapshot-Driven?** | ❌ No. Each card derives `allocationAction` via `deriveAllocationAction()` |
| **Recomputes/Derives?** | ✅ `inferIntelligence()` computes setup quality, risk pressure, trend quality, timing quality |
| **Consistent?** | ⚠️ Local `allocationAction` may differ from backend `signalAction` |

### Recommendation / Decision OS

| Aspect | Detail |
|--------|--------|
| **Data Source** | `topOpportunities`, `reviewOpportunities` memos |
| **Snapshot-Driven?** | ❌ No. `deriveAllocationAction()` + `sizeAdaptiveOpportunity()` run locally |
| **Recomputes/Derives?** | ✅ Full sizing pipeline, viability evaluation, confidence gates |
| **Consistent?** | ❌ Sizing computed locally may differ from backend sizing |

### Evidence / Market Perception

| Aspect | Detail |
|--------|--------|
| **Data Source** | `marketPerceptionSnapshot` state |
| **Snapshot-Driven?** | ⚠️ Partially. Snapshot comes from `MarketStateEngine.ingest()` which runs locally |
| **Recomputes/Derives?** | ✅ Full `SignalFrameworkEngine.cycleOnce()` runs in browser |
| **Consistent?** | ❌ Perception engine runs independently of backend; may diverge |

### Allocation / Sizing

| Aspect | Detail |
|--------|--------|
| **Data Source** | `allocationUniverse`, `allocationContext` memos |
| **Snapshot-Driven?** | ❌ No. `buildDashboardExposureSizing()` computes locally |
| **Recomputes/Derives?** | ✅ Full adaptive sizing with viability, constraints, exposure bands |
| **Consistent?** | ❌ Sizing is entirely frontend-computed |

### Regime / Meta-Allocation

| Aspect | Detail |
|--------|--------|
| **Data Source** | `strategyRegime` state + `classifyMarketRegime()` |
| **Snapshot-Driven?** | ❌ No. Regime classified locally |
| **Recomputes/Derives?** | ✅ `classifyMarketRegime()`, `decideMetaAllocation()`, `forecastSignalSurvival()` |
| **Consistent?** | ❌ Local regime may differ from `strategyRegime` from API |

### Learning / Decision Memory

| Aspect | Detail |
|--------|--------|
| **Data Source** | `fetchPortfolioDecisionMemory()`, `fetchPortfolioDecisionOutcomes()` |
| **Snapshot-Driven?** | ⚠️ Partially. Reads from API but also runs `evaluateStocksLearningJudgment()` locally |
| **Recomputes/Derives?** | ✅ `evaluateLearningJudgment()` from `@signal/decision` runs in browser |
| **Consistent?** | ⚠️ Learning judgment computed locally may differ from backend |

---

## 6. CONSISTENCY RISK ANALYSIS

### Cross-Screen Mismatches

| Risk | Screens Affected | Severity |
|------|------------------|----------|
| `allocationAction` derived locally vs backend `signalAction` | Positions, Recommendation, Allocation | **CRITICAL** |
| `classifyMarketRegime()` vs `strategyRegime` from API | Regime, Home, Allocation | **CRITICAL** |
| `marketHealthPct` formula vs `MarketStateSnapshot.compositeScore` | Home, Evidence | **HIGH** |
| `inferIntelligence()` scores vs backend quality/risk scores | Positions, Recommendation | **HIGH** |
| `sizeAdaptiveOpportunity()` vs backend sizing | Allocation, Recommendation | **CRITICAL** |

### Symbol-Level State Divergence

- Each stock's `DisplayStock` type has 30+ optional fields populated from different API calls at different times
- `stocksWithStrategySignals` memo merges strategy signals into stocks, but merge timing is non-deterministic
- Quote batch updates arrive incrementally; `inferIntelligence()` may run on partially-updated stocks

### Regime Propagation

- `strategyRegime` from API is stored in `useState`
- `classifyMarketRegime()` computes a potentially different regime from raw market data
- Both are used in different parts of the UI without reconciliation
- `decideMetaAllocation()` uses the locally-classified regime, not the API regime

### Stale State Handling

- `marketDataByMarketRef` caches per-market data but never invalidates on market switch
- `RollingCalibrationTracker` accumulates observations across market switches
- `api.ts` memory cache has TTL but no explicit invalidation on data changes
- `sessionStorage` cache persists across page reloads without versioning

---

## 7. SNAPSHOT MODEL VALIDATION

| Property | Expected | Actual | Status |
|----------|----------|--------|--------|
| Single `SystemSnapshot` object | Yes | No single object; 30+ state fragments | ❌ |
| Immutable | Yes | All state is mutable via `useState` setters | ❌ |
| Atomically replaced | Yes | Each `useState` updated independently; no transaction boundary | ❌ |
| Versioned | Yes | No versioning on any state | ❌ |
| Out-of-order update handling | Yes | No ordering guarantees; `useEffect` chains fire independently | ❌ |

**Finding**: There is no snapshot model. The closest approximation is `MarketStateSnapshot` produced by `MarketStateEngine.ingest()`, but this is:
1. Only one of 30+ state fragments
2. Computed locally (not received from backend)
3. Not immutable (history array is mutated via `push`/`splice`)
4. Not versioned
5. Not the single source of truth for the UI

---

## 8. FAILURE MODE HANDLING

### Backend Failure

| Scenario | Behavior | Assessment |
|----------|----------|------------|
| API returns 5xx | `request<T>()` throws, caught by `useEffect`, sets `refreshError` state | Degrades gracefully with error message |
| API returns empty data | `stocks` stays `[]`, `totalStocks` stays 0 | Shows "empty-results" dashboard state |
| Network offline | `navigator.onLine` detection, `isOnline` state | Shows "connection-lost" with cached data option |
| Partial quote batch | Some stocks get quotes, others remain `quoteStatus: "pending"` | Partial render; some cards show stale data |

### Partial Responses

| Scenario | Behavior | Assessment |
|----------|----------|------------|
| Quote batch returns subset | `fetchStockQuoteBatch()` paginated at 25/batch; partial results merged | Acceptable but no rollback on partial failure |
| Strategy API disabled | `ENABLE_STRATEGY_API` flag; graceful skip | Good — feature flag handling |
| Portfolio API disabled | `ENABLE_PORTFOLIO_API` flag; graceful skip | Good — feature flag handling |
| Backtest data missing | `backtestSummary` stays `null`; backtest sections render as "—" | Degrades gracefully |

### Invalid Data

| Scenario | Behavior | Assessment |
|----------|----------|------------|
| Malformed stock data | Zod parsing in `dashboard-data-adapter.ts` with fallback defaults | Silently accepts bad data with defaults — **RISK** |
| NaN/Infinity in numeric fields | `finiteNumber()` helper returns `undefined`; `clamp()` functions guard | Generally safe |
| Missing required fields | Zod schemas use `.optional()` and `.default()` extensively | Silently fills defaults — may hide data quality issues |
| Null in array positions | `Array.isArray()` guards in most places | Generally safe |

### UI Crash Risk

- The 10K+ line Dashboard component is a single render function — any unhandled exception crashes the entire UI
- No React Error Boundary observed
- No try/catch around `useMemo` computations (they cannot be caught by error boundaries during render)
- `MarketStateEngine.ingest()` is async but called inside `useEffect` — errors may be unhandled

---

## 9. CRITICAL RISKS SUMMARY

| Rank | Risk | Severity | Likelihood | Blast Radius |
|------|------|-----------|------------|--------------|
| 1 | **Frontend is second source of truth** — 16 CRITICAL business logic functions run in browser, producing allocation decisions, regime classifications, and sizing independently of backend | System-breaking | Certain | All screens — any decision shown may differ from backend truth |
| 2 | **No atomic state updates** — 30+ useState hooks update independently across multiple useEffect chains; no transaction boundary ensures consistent view | System-breaking | High | Cross-screen inconsistency; user sees partially-updated state |
| 3 | **Dual regime computation** — `classifyMarketRegime()` (local) vs `strategyRegime` (API) may disagree; `decideMetaAllocation()` uses local regime, allocation screen may use API regime | System-breaking | High | Allocation decisions based on wrong regime; exposure caps misapplied |
| 4 | **Mutable module-level singletons** — `RollingCalibrationTracker` and `MarketStateEngine.history` accumulate state outside React lifecycle; not reset on market switch; not captured in any snapshot | System-breaking | Medium | Stale calibration data leaks across market contexts; confidence scores contaminated |
| 5 | **No error boundary** — Single 10K+ line component with no crash protection; any unhandled exception in useMemo renders blank screen | UI-breaking | Medium | Complete UI loss requiring page refresh |

---

## 10. FINAL CLASSIFICATION

### **ARCHITECTURE BROKEN**

The frontend violates every principle of the intended architecture:

1. **Backend is single source of truth** → ❌ Frontend computes its own truth
2. **Frontend is snapshot renderer only** → ❌ Frontend runs full domain engine
3. **No business logic in UI** → ❌ 16 CRITICAL logic leaks identified
4. **No derived computation in frontend** → ❌ 20+ useMemo derived computations
5. **All data flows through /signal-client** → ❌ No `/signal-client` exists; 13 direct API calls
6. **System is fully snapshot-based** → ❌ No snapshot model; 30+ fragmented state fragments
7. **Single immutable snapshot** → ❌ No single snapshot; all state is mutable
8. **Atomic replacement** → ❌ Each state fragment updated independently

---

## Recommended Next Action

Per audit rules, no refactor suggestions are provided. The next action is to **use this report as the factual basis for a remediation plan**. The 10 sections above identify precisely what is broken, where the leaks are, and what the risks are. Any remediation effort should address the violations in order of the risk table (Section 9), starting with Risk #1 (frontend as second source of truth) since it has the highest severity, certainty, and blast radius.
