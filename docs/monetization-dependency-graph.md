# AlGAI Monetization — Complete Dependency Graph

**Date:** 2026-06-14  
**Purpose:** Pre-implementation scan for Type-Level + Runtime Hybrid Compiler (v8)  
**Scope:** All monetization-related logic: usage tracking, entitlement checks, UI components, event emitters, route definitions  

---

## 1. FILE INVENTORY (60 files)

### 1A. Domain/Monetization Layer (13 files)

| # | File | Role |
|---|------|------|
| 1 | `domain/monetization/capabilities.ts` | Capability enum + registry (ZERO imports — root of graph) |
| 2 | `domain/monetization/plans.ts` | Plan tiers + capability mapping |
| 3 | `domain/monetization/entitlements.ts` | Entitlement resolution (checkCapability, hasUsageLimit) |
| 4 | `domain/monetization/access-control.ts` | Access guard (hasCapability, hasSubjectAccess, FEATURE_FLAGS) |
| 5 | `domain/monetization/usage-metering.ts` | Usage tracking/incrementing |
| 6 | `domain/monetization/typed-routes.ts` | Type-level route compiler (defineRoute, enforceCapability) |
| 7 | `domain/monetization/auth_compiler_spec.ts` | Auth compiler spec (ProtectedRoute, PublicRoute types) |
| 8 | `domain/monetization/capability_state_service.ts` | Capability state resolution + warning levels |
| 9 | `domain/monetization/index.ts` | Barrel export |
| 10 | `domain/monetization/monetization.test.ts` | Domain tests |
| 11 | `domain/monetization/pipeline/route_inventory.json` | P0 route scan output |
| 12 | `domain/monetization/pipeline/capability_map.json` | P0 capability map output |
| 13 | `domain/monetization/pipeline/validation_checkpoint.json` | P7 validation output |

### 1B. Server/Entitlement Routes (7 files)

| # | File | Role |
|---|------|------|
| 14 | `frontend/app/api/entitlements/route.ts` | GET /api/entitlements (summary) |
| 15 | `frontend/app/api/entitlements/check/[capabilityKey]/route.ts` | GET /api/entitlements/check/:capabilityKey |
| 16 | `frontend/app/api/entitlements/engine/[engineKey]/route.ts` | GET /api/entitlements/engine/:engineKey |
| 17 | `frontend/app/api/entitlements/plan/route.ts` | GET /api/entitlements/plan |
| 18 | `frontend/app/api/entitlements/usage/[capabilityKey]/increment/route.ts` | POST /api/entitlements/usage/:capabilityKey/increment |
| 19 | `frontend/app/api/entitlements/capability-state/route.ts` | GET /api/entitlements/capability-state |
| 20 | `frontend/server/modules/entitlement/access-guard.ts` | Server-side accessGuard (DEAD CODE — unused) |

### 1C. Server/Billing Routes (3 files)

| # | File | Role |
|---|------|------|
| 21 | `frontend/app/api/billing/checkout/route.ts` | POST /api/billing/checkout → Stripe |
| 22 | `frontend/app/api/billing/portal/route.ts` | POST /api/billing/portal → Stripe |
| 23 | `frontend/app/api/billing/webhook/route.ts` | POST /api/billing/webhook ← Stripe |

### 1D. Server/Translation Routes (1 file)

| # | File | Role |
|---|------|------|
| 24 | `frontend/server/modules/translation/routes.ts` | POST /translate, /public/translator/translate, /public/translator/illustrate |

### 1E. Frontend/Monetization Components (8 files)

| # | File | Role |
|---|------|------|
| 25 | `frontend/components/monetization/FeatureGate.tsx` | Lock icon + paywall trigger |
| 26 | `frontend/components/monetization/PaywallModal.tsx` | Full paywall modal |
| 27 | `frontend/components/monetization/UsageCounter.tsx` | Usage/quota display |
| 28 | `frontend/components/monetization/QuotaStatusBar.tsx` | Global header quota bar |
| 29 | `frontend/components/monetization/UpgradeConfirmation.tsx` | Post-upgrade banner |
| 30 | `frontend/components/monetization/PlanExpirationBanner.tsx` | Past-due subscription banner |
| 31 | `frontend/components/monetization/PremiumUpgradeCard.tsx` | Home page upgrade CTA |
| 32 | `frontend/components/monetization/monetization_events.ts` | Client-side event bus |

### 1F. Frontend/Hooks (3 files)

| # | File | Role |
|---|------|------|
| 33 | `frontend/hooks/useEntitlement.ts` | Entitlement check hook |
| 34 | `frontend/hooks/usePlan.ts` | Plan resolution hook |
| 35 | `frontend/hooks/useUsage.ts` | Usage tracking hook |

### 1G. Frontend/Pages with Monetization (5 files)

| # | File | Role |
|---|------|------|
| 36 | `frontend/app/page.tsx` | Home — PremiumUpgradeCard |
| 37 | `frontend/app/courses/page.tsx` | Courses — FeatureGate + UsageCounter |
| 38 | `frontend/app/goal/page.tsx` | Goal — FeatureGate + UsageCounter |
| 39 | `frontend/app/achievements/page.tsx` | Achievements — FeatureGate |
| 40 | `frontend/app/pricing/page.tsx` | Pricing — plan comparison |
| 41 | `frontend/app/billing/page.tsx` | Billing — subscription management |

### 1H. Frontend/Layout (2 files)

| # | File | Role |
|---|------|------|
| 42 | `frontend/app/layout.tsx` | Root layout — PlanExpirationBanner |
| 43 | `frontend/components/layout/app-header.tsx` | Header — NO monetization elements currently |

### 1I. Frontend/Lib (2 files)

| # | File | Role |
|---|------|------|
| 44 | `frontend/lib/plans.ts` | Plan tier definitions (PLAN_TIERS, CapabilityKey) |
| 45 | `frontend/lib/billingApi.ts` | Stripe checkout/portal API client |

### 1J. Database (1 file)

| # | File | Role |
|---|------|------|
| 46 | `drizzle/0010_add_monetization.sql` | Monetization schema migration |

### 1K. Remaining files (14+)

| # | File | Role |
|---|------|------|
| 47–60 | Server modules (auth, schemas, students, analytics routes) | Non-monetized routes using requireRoles |

---

## 2. DEPENDENCY GRAPH (Import Arrows)

### 2A. Domain Layer (bottom-up)

```
capabilities.ts  ←── ZERO IMPORTS (root)
     │
     ├──→ plans.ts  (imports Capability)
     │       │
     │       └──→ entitlements.ts  (imports Capability, PlanId)
     │               │
     │               └──→ access-control.ts  (imports Capability, mapEngineKeyToCapability, 
     │                     MATH_ENGINE_KEY, PlanId, checkCapability, hasUsageLimit)
     │
     ├──→ typed-routes.ts  (imports Capability, hasCapability)
     │       │
     │       └──→ auth_compiler_spec.ts  (imports Capability)
     │
     ├──→ capability_state_service.ts  (imports Capability, PLAN_TIERS, CapabilityKey)
     │
     └──→ usage-metering.ts  (imports Capability)
```

### 2B. Server Routes (entitlement checks)

```
access-control.ts
     │
     ├──→ entitlements/check/[capabilityKey]/route.ts  (imports hasCapability)
     ├──→ entitlements/engine/[engineKey]/route.ts  (imports hasSubjectAccess)
     ├──→ entitlements/plan/route.ts  (imports plan resolution)
     ├──→ entitlements/capability-state/route.ts  (imports PLAN_TIERS, CapabilityKey)
     ├──→ entitlements/usage/[capabilityKey]/increment/route.ts  (imports usage-metering)
     └──→ translation/routes.ts  (imports enforceSubjectAccess, hasCapability)
```

### 2C. Frontend Components (UI layer)

```
plans.ts (frontend/lib)
     │
     ├──→ FeatureGate.tsx  (imports useEntitlement)
     ├──→ PaywallModal.tsx  (imports billingApi, usePlan)
     ├──→ UsageCounter.tsx  (imports useUsage)
     ├──→ QuotaStatusBar.tsx  (imports capability-state API)
     ├──→ PremiumUpgradeCard.tsx  (imports usePlan, billingApi)
     ├──→ PlanExpirationBanner.tsx  (imports usePlan)
     ├──→ UpgradeConfirmation.tsx  (imports URL params)
     └──→ monetization_events.ts  (standalone event bus)
```

### 2D. Frontend Hooks (data layer)

```
useEntitlement.ts  →  fetch /api/entitlements/check/:key
usePlan.ts         →  fetch /api/entitlements/plan
useUsage.ts        →  fetch /api/entitlements/usage/:key
```

### 2E. Pages (consumer layer)

```
page.tsx (Home)         →  PremiumUpgradeCard
courses/page.tsx        →  FeatureGate + UsageCounter
goal/page.tsx           →  FeatureGate + UsageCounter
achievements/page.tsx  →  FeatureGate
pricing/page.tsx        →  usePlan + billingApi
billing/page.tsx        →  usePlan + billingApi
layout.tsx              →  PlanExpirationBanner
```

---

## 3. DETAILED EXPORT/IMPORT MAP

### capabilities.ts (ROOT — zero imports)

**Exports:**
- `enum Capability` — USE_MATH, USE_CHEMISTRY, USE_PHYSICS, USE_CODING, USE_LANGUAGE, GENERATE_ILLUSTRATIONS, VIEW_ROADMAPS, UNLIMITED_MEMORY, WEEKLY_REPORTS
- `type CapabilityType` — "usage" | "access"
- `interface CapabilityDefinition` — { key, domain, type, description }
- `const CAPABILITY_REGISTRY` — readonly CapabilityDefinition[] (9 entries)
- `const ENGINE_KEY_MAP` — Record<string, Capability> (quemestry→USE_CHEMISTRY, chemistry→USE_CHEMISTRY, coding→USE_CODING, physics→USE_PHYSICS, language→USE_LANGUAGE)
- `const MATH_ENGINE_KEY` — "math"
- `function mapEngineKeyToCapability(engineKey)` — string → Capability | null
- `function getCapabilityDefinition(key)` — Capability → CapabilityDefinition | undefined
- `function isUsageCapability(key)` — Capability → boolean
- `function isAccessCapability(key)` — Capability → boolean

### plans.ts

**Imports:** `Capability` from `"./capabilities"`
**Exports:**
- `type PlanId` — "free" | "scholar" | "pro" | "family"
- `interface PlanTier` — { id, name, price, capabilities, stripePriceId }
- `const PLAN_TIERS` — PlanTier[] (4 plans)
- `function getPlanTier(planId)` — PlanId → PlanTier
- `function getCheapestPlanWithCapability(capability)` — Capability → PlanTier | null

### entitlements.ts

**Imports:** `Capability` from `"./capabilities"`, `PlanId` from `"./plans"`
**Exports:**
- `function checkCapability(userId, capability)` — → { granted, reason, usageLimit, currentUsage }
- `function hasUsageLimit(capability)` — → boolean
- `function resolvePlanCapabilities(planId)` — → Capability[]

### access-control.ts

**Imports:** `Capability, mapEngineKeyToCapability, MATH_ENGINE_KEY` from `"./capabilities"`, `PlanId` from `"./plans"`, `checkCapability, hasUsageLimit` from `"./entitlements"`
**Exports:**
- `interface PlanResolver` — { resolve(userId: string): Promise<PlanId> }
- `interface UsageResolver` — { resolve(userId: string, capability: Capability): Promise<number | null> }
- `interface AccessCheckResult` — { granted: boolean; reason?: string; remaining?: number | null }
- `function configurePlanResolver(resolver: PlanResolver)` — void
- `function configureUsageResolver(resolver: UsageResolver)` — void
- `function hasCapability(userId, capability)` — → Promise<AccessCheckResult>
- `function hasSubjectAccess(userId, engineKey)` — → Promise<AccessCheckResult>
- `const FEATURE_FLAGS` — { enableChemistry: true, enablePhysics: true, ... }
- `function isFeatureEnabled(flag)` — boolean
- `function accessGuard(capability)` — (userId: string) → Promise<AccessCheckResult>

### typed-routes.ts

**Imports:** `Capability` from `"./capabilities"`, `hasCapability` from `"./access-control"`
**Exports:**
- `interface ProtectedRoute<C extends Capability>` — { method, path, capability, requireAuth: true, failClosed: true }
- `interface PublicRoute` — { method, path: `/public/${string}`, capability: never, requireAuth: false, failClosed: true }
- `type HandlerWithCapability<C>` — (request, reply) → Promise<any>
- `const routeRegistry` — Array<ProtectedRoute | PublicRoute>
- `function defineRoute<C>(capability, config)` — ProtectedRoute<C>
- `function definePublicRoute(config)` — PublicRoute
- `function enforceCapability(request, capability)` — Promise<void> (fail-closed)
- `function mountProtectedRoute(app, route, handler)` — Promise<void>
- `function validateRouteRegistry()` — { pass, violations }
- `function getRouteRegistry()` — ReadonlyArray

### capability_state_service.ts

**Imports:** `Capability` from `"./capabilities"`, `PLAN_TIERS, CapabilityKey` from `"../../frontend/lib/plans"`
**Exports:**
- `type WarningLevel` — "none" | "low" | "medium" | "high" | "exhausted"
- `interface CapabilityState` — { capability, granted, usageLimit, currentUsage, remaining, utilizationPercent, warningLevel, planRequired }
- `interface CapabilityStateSummary` — { userId, planId, capabilities, globalWarningLevel, anyCapabilityExhausted }
- `interface ThresholdEvent` — { capability, warningLevel, utilizationPercent, timestamp }
- `function resolveCapabilityState(userId, planId, usageResolver)` — Promise<CapabilityStateSummary>
- `function checkThresholdEvents(previous, current)` — ThresholdEvent[]

### monetization_events.ts (client-side)

**Imports:** (none — standalone)
**Exports:**
- `type WarningLevel` — "none" | "low" | "medium" | "high" | "exhausted"
- `interface MonetizationEvent` — { type, capability, warningLevel, utilizationPercent, timestamp, metadata? }
- `function onMonetizationEvent(type, handler)` — unsubscribe function
- `function emitMonetizationEvent(event)` — void
- `function checkThresholdCrossing(capability, currentUtilization)` — MonetizationEvent | null
- `function getNudgeMessage(event)` — { title, body, cta, ctaHref } | null

### FeatureGate.tsx

**Imports:** `useEntitlement` from `"@/hooks/useEntitlement"`
**Exports:** `function FeatureGate({ capabilityKey, children, fallback? })` — React component

### PaywallModal.tsx

**Imports:** `usePlan` from `"@/hooks/usePlan"`, `billingApi` from `"@/lib/billingApi"`
**Exports:** `function PaywallModal({ capabilityKey, isOpen, onClose })` — React component

### UsageCounter.tsx

**Imports:** `useUsage` from `"@/hooks/useUsage"`
**Exports:** `function UsageCounter({ capabilityKey })` — React component

### QuotaStatusBar.tsx

**Imports:** (fetches `/api/entitlements/capability-state` directly)
**Exports:** `function QuotaStatusBar()` — React component

### PremiumUpgradeCard.tsx

**Imports:** `usePlan` from `"@/hooks/usePlan"`, `billingApi` from `"@/lib/billingApi"`
**Exports:** `function PremiumUpgradeCard()` — React component

### PlanExpirationBanner.tsx

**Imports:** `usePlan` from `"@/hooks/usePlan"`
**Exports:** `function PlanExpirationBanner()` — React component

### UpgradeConfirmation.tsx

**Imports:** (reads URL searchParams)
**Exports:** `function UpgradeConfirmation()` — React component

### frontend/lib/plans.ts

**Imports:** (none — standalone)
**Exports:**
- `type CapabilityKey` — string union of all capability keys
- `interface PlanTier` — { id, name, price, capabilities, stripePriceId }
- `const PLAN_TIERS` — PlanTier[]
- `function getPlanTier(planId)` — PlanTier

---

## 4. CRITICAL OBSERVATIONS FOR V8 COMPILER

### 4A. Orphan Capabilities (no event subscriber)

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