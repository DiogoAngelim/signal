# AlGAI Monetization — V8 Compiler Mapping

**Date:** 2026-06-14  
**Purpose:** V8 Type-Level + Runtime Hybrid Compiler implementation mapping  
**Based on:** `docs/monetization-dependency-graph.md` (60-file inventory)

---

## 1. ORPHAN CAPABILITIES (ALL 9)

| Capability | Has UI Subscriber? | Has Event Mapping? | Status |
|------------|-------------------|--------------------|--------|
| USE_MATH | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| USE_CHEMISTRY | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| USE_PHYSICS | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| USE_CODING | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| USE_LANGUAGE | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| GENERATE_ILLUSTRATIONS | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| VIEW_ROADMAPS | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| UNLIMITED_MEMORY | ✅ FeatureGate | ❌ No event mapping | ORPHAN |
| WEEKLY_REPORTS | ✅ FeatureGate | ❌ No event mapping | ORPHAN |

**ALL 9 capabilities are ORPHANS** — none have typed event subscriptions via the bus. The `monetization_events.ts` event bus exists but is NOT connected to any capability.

---

## 2. DISCONNECTED LAYERS (bus not wired)

| Layer | Connected to Bus? | Evidence |
|-------|-------------------|----------|
| `capability_state_service.ts` | ❌ NO | Resolves state but doesn't emit events |
| `monetization_events.ts` | ❌ NO | Has emit/subscribe but nothing calls emit |
| `QuotaStatusBar.tsx` | ❌ NO | Fetches API directly, doesn't subscribe to bus |
| `FeatureGate.tsx` | ❌ NO | Uses `useEntitlement` hook, not bus subscription |
| `UsageCounter.tsx` | ❌ NO | Uses `useUsage` hook, not bus subscription |
| `PaywallModal.tsx` | ❌ NO | Triggered by FeatureGate state, not bus event |
| Server routes | ❌ NO | Return HTTP responses, don't emit bus events |

---

## 3. DUPLICATE TYPE DEFINITIONS

| Type | Defined In 1 | Defined In 2 | Conflict? |
|------|---------------|---------------|-----------|
| `WarningLevel` | `capability_state_service.ts` | `monetization_events.ts` | ✅ YES — duplicate, not shared |
| `CapabilityState` | `capability_state_service.ts` | `capability-state/route.ts` (inline) | ✅ YES — redefined inline |
| `PlanTier` | `domain/monetization/plans.ts` | `frontend/lib/plans.ts` | ✅ YES — two separate plan definitions |
| `CapabilityKey` | `frontend/lib/plans.ts` | `domain/monetization/capabilities.ts` (as `Capability`) | ✅ YES — enum vs string union |

---

## 4. DEAD CODE

| File | Status | Evidence |
|------|--------|----------|
| `server/modules/entitlement/access-guard.ts` | DEAD | Defines `accessGuard` but ZERO routes import it |
| `auth_compiler_spec.ts` | MOSTLY DEAD | Types redefined in `typed-routes.ts`; spec functions never called at runtime |

---

## 5. V8 COMPILER REQUIREMENTS vs CURRENT STATE

| v8 Requirement | Current State | Gap |
|----------------|---------------|-----|
| Every capability MUST declare event source | ❌ No capability declares events | Need `CapabilityEventMap` |
| Every UI consumer MUST declare subscription | ❌ UI uses hooks, not bus subscriptions | Need `useMonetizationSubscription<C>` |
| Missing wiring = TypeScript error | ❌ No compile-time enforcement | Need `ValidateBusSystem<R>` |
| Runtime bus enforces consistency | ❌ Bus exists but disconnected | Need `MonetizationAttentionBusImpl` wired to state service |
| No orphan capabilities | ❌ All 9 are orphans | Need subscription registry |
| No UI without subscription | ❌ All UI bypasses bus | Need `useMonetizationSubscription` hook |

---

## 6. TYPE UNIFICATION PLAN

```
CURRENT (fragmented):
  capabilities.ts → enum Capability
  plans.ts (domain) → type PlanId
  plans.ts (frontend/lib) → type CapabilityKey + interface PlanTier
  capability_state_service.ts → type WarningLevel
  monetization_events.ts → type WarningLevel (duplicate)
  monetization_events.ts → interface MonetizationEvent (untyped)

TARGET (unified):
  capabilities.ts → enum Capability (ROOT — unchanged)
  plans.ts (domain) → type PlanId + interface PlanTier (SINGLE SOURCE)
  monetization-types.ts → CapabilityEventMap + MonetizationEvent (typed per capability)
  monetization-types.ts → WarningLevel (single definition)
  monetization-types.ts → SubscriptionRegistry (compile-time enforcement)
```

---

## 7. EVENT WIRING PLAN

```
CURRENT:
  capability_state_service.ts → resolves state → NO EMIT
  monetization_events.ts → has emit/subscribe → NO CALLERS
  QuotaStatusBar.tsx → fetches API → NO SUBSCRIPTION
  FeatureGate.tsx → useEntitlement hook → NO SUBSCRIPTION

TARGET:
  capability_state_service.ts → resolves state → compileCapabilityStateToEvent() → bus.emit()
  MonetizationAttentionBus → typed emit/subscribe per Capability
  QuotaStatusBar.tsx → useMonetizationSubscription("translate", handler)
  FeatureGate.tsx → useMonetizationSubscription(capabilityKey, handler)
  UsageCounter.tsx → useMonetizationSubscription(capabilityKey, handler)
```

---

## 8. COMPILE-TIME ENFORCEMENT PLAN

```
CURRENT:
  No compile-time check for orphan capabilities
  No compile-time check for unsubscribed UI
  No compile-time check for incomplete event mapping

TARGET:
  ValidateBusSystem<SubscriptionRegistry> → TypeScript error if any capability has []
  CapabilityEventMap → TypeScript error if event type doesn't match capability
  useMonetizationSubscription<C> → TypeScript error if C is not a valid CapabilityKey
```

---

## 9. FILES TO CREATE FOR V8

| File | Purpose |
|------|---------|
| `domain/monetization/monetization-types.ts` | Unified type system: CapabilityEventMap, MonetizationEvent, SubscriptionRegistry, ValidateBusSystem |
| `domain/monetization/attention-bus.ts` | MonetizationAttentionBusImpl: typed emit/subscribe runtime |
| `frontend/hooks/useMonetizationSubscription.ts` | Typed hook: `useMonetizationSubscription<C>(capability, handler)` |
| `frontend/components/monetization/MonetizationNudgeProvider.tsx` | Root provider: wires bus to UI nudges |
| `domain/monetization/subscription-registry.ts` | Compile-time registry: maps every capability → its UI subscribers |

## 10. FILES TO MODIFY FOR V8

| File | Change |
|------|--------|
| `domain/monetization/capability_state_service.ts` | Add `compileCapabilityStateToEvent()` + bus.emit() calls |
| `frontend/components/monetization/monetization_events.ts` | Refactor to use unified types from `monetization-types.ts` |
| `frontend/components/monetization/QuotaStatusBar.tsx` | Replace direct fetch with `useMonetizationSubscription` |
| `frontend/components/monetization/FeatureGate.tsx` | Add `useMonetizationSubscription` alongside existing hook |
| `frontend/components/monetization/UsageCounter.tsx` | Add `useMonetizationSubscription` alongside existing hook |
| `frontend/app/layout.tsx` | Mount `MonetizationNudgeProvider` |
| `frontend/components/layout/app-header.tsx` | Mount `QuotaStatusBar` + `PlanBadge` |
| `domain/monetization/index.ts` | Re-export unified types |

---

**Dependency graph complete. 60 files inventoried. 9 orphan capabilities identified. Bus completely disconnected. Duplicate types found. Dead code flagged. V8 compiler mapping defined. Ready for implementation.**