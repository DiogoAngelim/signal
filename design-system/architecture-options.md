# Phase 1 — Architecture Design: Dyslexia-Friendly Design System

**Date**: 2026-06-14  
**Status**: Architecture selection complete

---

## Option A — Token-Driven System

### Structural Design

```
design-system/
  tokens/
    typography.ts    ← font-size, line-height, letter-spacing, font-family
    spacing.ts       ← spacing scale, vertical rhythm
    colors.ts        ← contrast-enforced palette
    layout.ts        ← max-width, content constraints
  index.ts           ← re-exports all tokens
```

All tokens are plain TypeScript constants. UI code imports tokens and applies them via inline styles or CSS custom properties.

**Enforcement**: Tokens are the only source of truth, but nothing prevents developers from using raw values.

### Pros
- Minimal surface area — just constants
- Zero runtime overhead
- Easy to adopt incrementally
- Works with any styling method (inline, CSS, Tailwind)

### Cons
- **No enforcement** — developers can bypass tokens freely
- **No component-level constraints** — tokens don't enforce line-length, heading hierarchy, or chunking
- **No layout middleware** — reading-width and vertical rhythm must be manually applied
- Migration requires touching every file to replace hardcoded values
- Risk of token drift — tokens exist but are ignored

### Risk Analysis
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tokens bypassed | High | Critical | None built-in |
| Inconsistent application | High | High | Code review only |
| Drift over time | Medium | High | No enforcement |
| Missing constraints | Certain | Critical | Not addressable by tokens alone |

### Migration Complexity: Low (initial), High (maintenance)
### Runtime Overhead: Zero
### Maintainability Score: 4/10

---

## Option B — Component Wrapper System

### Structural Design

```
design-system/
  components/
    ReadableText.tsx
    ReadableHeading.tsx
    ReadableContainer.tsx
    ReadableParagraph.tsx
    ReadableCard.tsx
    ReadableLayout.tsx
  hooks/
    useReadableStyle.ts
  index.ts
```

Each component wraps a semantic HTML element and enforces readability rules internally. Existing code migrates by swapping `<p>` for `<ReadableParagraph>`, `<div>` for `<ReadableContainer>`, etc.

**Enforcement**: Components enforce rules, but developers can still use raw HTML elements.

### Pros
- **Strong component-level enforcement** — any text inside a Readable* component gets correct typography, spacing, and constraints
- **Self-documenting** — component names communicate intent
- **Gradual migration** — swap one component at a time
- **Encapsulated accessibility** — ARIA attributes, roles, and focus management built-in
- **Testable** — components can be unit-tested for compliance

### Cons
- **No token layer** — values are hardcoded inside components, making global changes difficult
- **Duplication risk** — same values repeated across components
- **No layout middleware** — ReadableLayout helps but doesn't enforce at a system level
- **Wrapper fatigue** — developers may resist using wrapper components for every element
- **Bypass still possible** — raw HTML elements still accessible

### Risk Analysis
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Raw HTML bypass | Medium | High | ESLint rule |
| Value duplication | High | Medium | Extract to shared constants |
| Wrapper fatigue | Medium | Medium | Good DX, minimal API |
| Missing token layer | Certain | High | Refactor later |

### Migration Complexity: Medium
### Runtime Overhead: Minimal (thin wrappers)
### Maintainability Score: 6/10

---

## Option C — Hybrid System (Tokens + Components + Enforcement)

### Structural Design

```
design-system/
  tokens/
    typography.ts     ← font-size scale, line-height, letter-spacing, font-family
    spacing.ts        ← spacing scale (4px base), vertical rhythm
    colors.ts         ← contrast-enforced palette, status colors
    layout.ts         ← max-width, content constraints, breakpoints
  components/
    ReadableText.tsx       ← generic readable text (enforces tokens)
    ReadableHeading.tsx    ← h1-h6 with enforced hierarchy
    ReadableContainer.tsx  ← max-width + vertical rhythm
    ReadableParagraph.tsx  ← body text with chunking
    ReadableCard.tsx       ← card with readable internals
  layout/
    ReadableLayout.tsx     ← page-level reading comfort zone
  enforcement/
    eslint-no-raw-style.ts ← ESLint rule: prevent raw style values
    type-enforcement.ts   ← TypeScript branded types for token values
  index.ts                 ← public API
```

**Three-layer enforcement**:
1. **Tokens** — single source of truth for all values
2. **Components** — enforce tokens + layout + accessibility constraints
3. **Enforcement** — ESLint rule + TypeScript branded types prevent bypass

### Pros
- **Full enforcement** — tokens are the only way to get values; components are the only way to render text
- **System-level constraints** — reading-width, vertical rhythm, and chunking are enforced at layout level
- **Incremental migration** — tokens can be adopted first, then components, then enforcement
- **Zero duplication** — all values flow from tokens through components
- **Testable at every layer** — tokens, components, and enforcement rules are independently testable
- **Extensible** — new components inherit all rules automatically
- **Bypass-resistant** — ESLint + TypeScript make it hard to use raw values

### Cons
- **Largest initial surface area** — more files to create
- **Enforcement can be relaxed** — ESLint rules can be disabled, types can be cast away
- **Learning curve** — developers must understand the three-layer model
- **More opinionated** — stronger constraints mean less flexibility

### Risk Analysis
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ESLint disabled | Low | Medium | CI enforcement |
| Type cast bypass | Low | Low | Code review |
| Learning curve | Medium | Medium | README + examples |
| Surface area | Medium | Low | Clear module boundaries |
| Over-constraint | Low | Medium | Escape hatch via `data-readable-ignore` |

### Migration Complexity: Medium-High (initial), Low (maintenance)
### Runtime Overhead: Minimal (tokens are constants, components are thin wrappers)
### Maintainability Score: 9/10

---

## Comparative Analysis

| Dimension | Option A (Tokens) | Option B (Components) | Option C (Hybrid) |
|-----------|-------------------|----------------------|--------------------|
| Enforcement strength | ❌ None | ⚠️ Partial | ✅ Full |
| Token consistency | ✅ Single source | ❌ Duplicated | ✅ Single source |
| Component constraints | ❌ None | ✅ Per-component | ✅ System-wide |
| Layout enforcement | ❌ None | ⚠️ Per-component | ✅ System-wide |
| Accessibility built-in | ❌ None | ✅ Per-component | ✅ System-wide |
| Bypass resistance | ❌ None | ⚠️ Low | ✅ High |
| Migration effort | Low | Medium | Medium-High |
| Runtime overhead | Zero | Minimal | Minimal |
| Maintainability | 4/10 | 6/10 | 9/10 |
| Extensibility | Low | Medium | High |
| Test coverage | None | Per-component | All layers |

---

## Selection: Option C — Hybrid System

### Justification

Option C is selected because:

1. **The audit found systemic issues** — not isolated problems. A token-only approach (A) cannot enforce layout constraints, reading-width, or accessibility. A component-only approach (B) cannot prevent token drift or enforce system-wide rules.

2. **Enforcement is non-negotiable** — the task requires "enforceable, not advisory" design. Option A is advisory. Option B is partially enforceable. Only Option C provides enforcement at every layer.

3. **The maintenance cost is front-loaded** — Option C has higher initial complexity but lower long-term maintenance because:
   - Tokens prevent value drift
   - Components prevent accessibility regressions
   - Enforcement prevents bypass
   - All three are independently testable

4. **Migration is incremental** — the three layers can be adopted in sequence:
   - Phase 1: Import tokens (zero breaking changes)
   - Phase 2: Wrap components (one component at a time)
   - Phase 3: Enable enforcement (CI gate)

5. **Runtime overhead is negligible** — tokens are compile-time constants, components are thin wrappers with no state, and enforcement is build-time only.

The hybrid system is the simplest architecture that satisfies **all** requirements: token-driven typography, enforced components, layout constraints, accessibility, and bypass prevention.