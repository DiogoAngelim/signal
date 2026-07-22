# Migration Strategy — Dyslexia-Friendly Design System

## Phase 4: Incremental Migration Plan

### Top 10 Highest-Impact Components to Migrate

Based on the Phase 0 audit, these components have the highest readability impact:

| # | Component | Location | Issue | Impact |
|---|-----------|----------|-------|--------|
| 1 | `Positions.tsx` | `examples/stock-optimizer/artifacts/stocks-optimizer/src/pages/` | Dense data table, raw font sizes, no line constraints | Very High — financial data readability |
| 2 | `WeatherMapBackground.tsx` | `examples/aware/src/frontend/` | Text overlay readability, no contrast enforcement | High — weather data comprehension |
| 3 | `algaiParentAccess.ts` | `examples/algai-parent-dashboard/src/api/` | API response display, status indicators | High — parent-facing status |
| 4 | `alerts.ts` | `examples/aware/src/adapters/` | Alert text, color-only status | High — triple-cue violation |
| 5 | `regions.ts` | `examples/aware/src/adapters/` | Region labels, small text | Medium — label readability |
| 6 | `App.tsx` (algai) | `examples/algai/frontend/` | Root layout, no width constraints | High — affects all child content |
| 7 | `App.tsx` (aware) | `examples/aware/src/` | Root layout, no width constraints | High — affects all child content |
| 8 | `App.tsx` (liquidity) | `examples/liquidity-manager/src/` | Root layout, no width constraints | High — affects all child content |
| 9 | `App.tsx` (stock-optimizer) | `examples/stock-optimizer/artifacts/stocks-optimizer/src/` | Root layout, no width constraints | High — affects all child content |
| 10 | `App.tsx` (algai-parent) | `examples/algai-parent-dashboard/src/` | Root layout, no width constraints | High — affects all child content |

### Step-by-Step Migration Plan

#### Step 1: Foundation Setup (Zero Breaking Changes)

**Action**: Install design system as importable module

```typescript
// In each example's package.json, add:
// "dependencies": { "@signal/design-system": "workspace:*" }
```

**Verification**: Import tokens without using them yet. No visual change.

**Risk**: None — additive only.

---

#### Step 2: Root Layout Wrapping (Zero Breaking Changes)

**Action**: Wrap each `App.tsx` root with `ReadableLayout`

```diff
+ import { ReadableLayout } from '@signal/design-system';

  function App() {
    return (
+     <ReadableLayout>
        {children}
+     </ReadableLayout>
    );
  }
```

**Effect**: Sets font family, max width, and reduced motion CSS on root.

**Verification**: Visual check — content should be centered with max 640px width.

**Risk**: Low — may shift full-width layouts. Use `width="full"` for non-text layouts.

---

#### Step 3: Heading Migration (Zero Breaking Changes)

**Action**: Replace raw `<h1>`–`<h6>` with `ReadableHeading`

```diff
+ import { ReadableHeading } from '@signal/design-system';

- <h1 className="text-2xl font-bold">Title</h1>
+ <ReadableHeading level={1}>Title</ReadableHeading>
```

**Effect**: Enforces heading scale, line height, letter spacing.

**Verification**: Headings should have consistent sizing and spacing.

**Risk**: Very low — headings are isolated elements.

---

#### Step 4: Body Text Migration (Zero Breaking Changes)

**Action**: Replace long `<p>` blocks with `ReadableParagraph`

```diff
+ import { ReadableParagraph } from '@signal/design-system';

- <p className="text-sm text-gray-600">Long description...</p>
+ <ReadableParagraph>Long description...</ReadableParagraph>
```

**Effect**: Enforces line length (65ch), line height (1.5+), letter spacing.

**Verification**: Paragraphs should have comfortable reading width.

**Risk**: Low — may narrow overly wide text blocks (intended behavior).

---

#### Step 5: Status Indicators Migration (Triple-Cue Enforcement)

**Action**: Replace color-only status with `ReadableText` status prop

```diff
+ import { ReadableText } from '@signal/design-system';

- <span style={{ color: '#dc2626' }}>Error</span>
+ <ReadableText status={{ type: 'error', label: 'Error' }}>Details</ReadableText>
```

**Effect**: Enforces triple-cue pattern (color + icon + label).

**Verification**: All status indicators show icon + label + color.

**Risk**: Low — visual change is additive (icon + label added).

---

#### Step 6: Card Migration (Zero Breaking Changes)

**Action**: Replace card containers with `ReadableCard`

```diff
+ import { ReadableCard } from '@signal/design-system';

- <div className="bg-white rounded-lg shadow p-6">
+ <ReadableCard title="Card Title">
    {children}
+ </ReadableCard>
```

**Effect**: Enforces padding, background, border radius from tokens.

**Risk**: Low — visual change is minimal (token values match existing).

---

#### Step 7: Container Migration (Zero Breaking Changes)

**Action**: Replace content wrappers with `ReadableContainer`

```diff
+ import { ReadableContainer } from '@signal/design-system';

- <div className="max-w-2xl mx-auto p-6">
+ <ReadableContainer width="default" padding={6}>
    {children}
+ </ReadableContainer>
```

**Effect**: Enforces content width and padding from tokens.

**Risk**: Low — may narrow some containers (intended behavior).

---

#### Step 8: Data Table Readability (Positions.tsx Focus)

**Action**: Wrap table cells with `ReadableText` and enforce minimum font size

```diff
+ import { ReadableText } from '@signal/design-system';

- <td style={{ fontSize: '12px' }}>{value}</td>
+ <td><ReadableText size="xs">{value}</ReadableText></td>
```

**Effect**: Enforces minimum 14px font size in data tables.

**Risk**: Medium — table layout may shift with larger text. Test carefully.

---

#### Step 9: ESLint Rule Activation (Advisory Phase)

**Action**: Add ESLint rule as `warn` (not `error`)

```javascript
// .eslintrc.js
rules: {
  '@signal/design-system/no-raw-style-values': 'warn',
}
```

**Effect**: Developers see warnings for raw style values but builds don't fail.

**Risk**: None — advisory only.

---

#### Step 10: ESLint Rule Enforcement (Error Phase)

**Action**: Upgrade ESLint rule from `warn` to `error`

```javascript
// .eslintrc.js
rules: {
  '@signal/design-system/no-raw-style-values': 'error',
}
```

**Effect**: CI fails on raw style values. Design system is now enforced.

**Risk**: Medium — may require fixing accumulated warnings. Run after Step 9 audit.

---

### Migration Safety Principles

1. **Additive First**: Every step adds constraints without removing existing behavior
2. **Visual Regression Testing**: Compare before/after screenshots at each step
3. **Rollback Ready**: Each step is independently revertible
4. **No Product Logic Changes**: Design system affects presentation only
5. **Boundary Clarity**: Migrated components use `Readable*` prefix; unmigrated use raw styles
6. **Progressive Enforcement**: Warn → Error escalation for ESLint rules

### Mixed-System Boundary

During migration, two systems coexist:

| Zone | Components | Rules |
|------|-----------|-------|
| **Migrated** | `Readable*` components | Token-enforced, ESLint-protected |
| **Unmigrated** | Raw styles | ESLint warnings, no errors |
| **Design System Internals** | `design-system/` files | Exempt from ESLint rules |

The boundary is clear: any component using `Readable*` is fully token-driven. Any component not yet migrated uses raw styles with advisory warnings.

### Success Metrics

- [ ] All root layouts wrapped in `ReadableLayout`
- [ ] All headings use `ReadableHeading`
- [ ] All body text paragraphs use `ReadableParagraph`
- [ ] All status indicators use triple-cue pattern
- [ ] All cards use `ReadableCard`
- [ ] ESLint rule active in error mode
- [ ] Zero raw style values in migrated components
- [ ] No font size below 0.875rem (14px)
- [ ] No line height below 1.25
- [ ] No text block wider than 75ch