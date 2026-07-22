# Migration Strategy — Dyslexia-Friendly Design System

## Top 10 Highest-Impact Components to Migrate

Components are ranked by text-density × user-visibility × readability-risk.

| Priority | Component | File | Risk | Impact |
|----------|-----------|------|------|--------|
| 1 | DashboardPage | `frontend/src/features/dashboard/DashboardPage.tsx` | High — dense text, no line limits | ✅ Migrated |
| 2 | DecisionsPage | `frontend/src/features/decisions/DecisionsPage.tsx` | High — table data, status colors | ✅ Migrated |
| 3 | DecisionDetailPage | `frontend/src/features/decisions/DecisionDetailPage.tsx` | High — evidence list, long text | ✅ Migrated |
| 4 | DecisionEvaluatePage | `frontend/src/features/decisions/DecisionEvaluatePage.tsx` | Medium — form + results | ✅ Migrated |
| 5 | DecisionReplayPage | `frontend/src/features/decisions/DecisionReplayPage.tsx` | Medium — boolean results | ✅ Migrated |
| 6 | NoteDetailPage | `frontend/src/features/notes/NoteDetailPage.tsx` | High — long body text | ✅ Migrated |
| 7 | PostDetailPage | `frontend/src/features/posts/PostDetailPage.tsx` | High — long body text | ✅ Migrated |
| 8 | PostPublishPage | `frontend/src/features/posts/PostPublishPage.tsx` | Medium — form | ✅ Migrated |
| 9 | PaymentCapturePage | `frontend/src/features/payments/PaymentCapturePage.tsx` | Medium — form-heavy | ✅ Migrated |
| 10 | PaymentDetailPage | `frontend/src/features/payments/PaymentDetailPage.tsx` | Medium — data display | ✅ Migrated |

## Step-by-Step Migration Plan

### Phase A: Immediate (Completed)
All 10 high-impact components have been migrated with inline token-compliant styles.

### Phase B: Token Extraction (Next)
1. Replace inline style objects with token imports from `design-system/tokens.ts`
2. Replace `<h1 style={...}>` with `<ReadableHeading level={1}>`
3. Replace `<p style={...}>` with `<ReadableParagraph>`
4. Replace `<div style={{ background: "#fff", ... }}>` with `<ReadableCard>`
5. Replace page wrapper `<div style={{ maxWidth: "65ch" }}>` with `<ReadableContainer>`

### Phase C: Component Migration Pattern
For each component, follow this exact sequence:

```
1. Import tokens from design-system/tokens
2. Replace hardcoded colors with color.* tokens
3. Replace hardcoded font sizes with fontSize.* tokens
4. Replace hardcoded line heights with lineHeight.* tokens
5. Replace hardcoded spacing with spacing.* tokens
6. Replace raw heading elements with ReadableHeading
7. Replace raw paragraph elements with ReadableParagraph
8. Replace card containers with ReadableCard
9. Replace page wrappers with ReadableContainer
10. Verify build passes (tsc --noEmit && vite build)
```

### Phase D: Enforcement Activation
1. Add `no-hardcoded-styles` ESLint rule to `.eslintrc`
2. Set to "warn" initially (non-blocking)
3. After full migration, set to "error" (blocking)

## Zero Breaking Changes Guarantee

- All migrations are style-only changes
- No product logic is modified
- No API contracts are changed
- No component interfaces are changed
- Build must pass after every migration step
- Visual regression testing via manual review

## Mixed System Boundaries

During migration, two systems coexist:
1. **Legacy**: Inline styles with hardcoded values (pre-migration)
2. **Design System**: Token-referenced styles (post-migration)

Boundary rules:
- New components MUST use design system tokens
- Migrated components MUST NOT reintroduce hardcoded values
- ESLint rule catches violations at CI time
- No partial migration — a component is either fully migrated or not

## Remaining Components (Lower Priority)

| Component | File | Notes |
|-----------|------|-------|
| CommitmentEvaluatePage | `frontend/src/features/commitment/CommitmentEvaluatePage.tsx` | ✅ Migrated |
| App shell | `frontend/src/App.tsx` | ✅ Migrated (global styles) |
| Nav | `frontend/src/App.tsx` (inline) | ✅ Migrated |

All frontend components have been migrated in this initial pass.