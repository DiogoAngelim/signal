# Dyslexia-Friendly Design System

## Overview

A production-grade UX infrastructure layer that improves readability, reduces cognitive load, and enforces consistent accessibility-first UI patterns for dyslexia-friendly reading and interaction.

## Architecture

**Selected: Option C — Hybrid System** (Tokens + enforced components + layout constraints)

Justification: Token-only (Option A) lacks component enforcement. Wrapper-only (Option B) lacks centralized token control. The hybrid approach provides token-driven values, component-level enforcement, and layout constraint middleware — the simplest architecture satisfying all requirements.

## Quick Start

```tsx
import { ReadableText, ReadableHeading, ReadableContainer, ReadableCard, ReadableParagraph, ReadableLayout } from "./design-system/components";
import { heading, body, card, button, color, contentWidth } from "./design-system/tokens";

// Use components for enforced readability
<ReadableLayout>
  <ReadableHeading level={1}>Page Title</ReadableHeading>
  <ReadableCard>
    <ReadableParagraph>Body text with enforced line length and spacing.</ReadableParagraph>
  </ReadableCard>
</ReadableLayout>
```

## File Structure

```
design-system/
├── spec.md                    # Formal specification
├── tokens.ts                  # Consolidated token definitions
├── README.md                  # This file
├── tokens/
│   ├── typography.ts          # Typography re-exports
│   ├── spacing.ts             # Spacing re-exports
│   ├── colors.ts              # Color re-exports
│   └── layout.ts              # Layout re-exports
├── components/
│   ├── ReadableText.tsx
│   ├── ReadableHeading.tsx
│   ├── ReadableContainer.tsx
│   ├── ReadableParagraph.tsx
│   ├── ReadableCard.tsx
│   └── ReadableLayout.tsx
├── enforcement/
│   └── no-hardcoded-styles.js # ESLint rule
└── migration.md               # Migration strategy
```

## Design Principles

1. **Token-First**: All values come from tokens. No ad-hoc magic numbers.
2. **Component-Enforced**: Readable* components enforce constraints at the component level.
3. **Layout-Constrained**: Max-width reading zones prevent eye-strain from wide text.
4. **Triple-Encoding**: Status uses icon + color + text (never color alone).
5. **Minimum Readability**: lineHeight ≥ 1.65 for body, letterSpacing ≥ 0.02em, fontSize ≥ 1rem.

## Token Reference

| Category | Key Tokens |
|----------|-----------|
| Typography | `fontSize`, `lineHeight`, `letterSpacing`, `fontWeight`, `fontFamily` |
| Spacing | `spacing[1-12]` (0.25rem–3rem) |
| Colors | `color.textPrimary`, `color.textHeading`, `color.success`, `color.error` |
| Layout | `contentWidth.narrow/default/wide`, `borderRadius`, `shadow` |
| Composite | `heading.h1/h2/h3`, `body.default/secondary/muted`, `card`, `button`, `label`, `input` |

## Enforcement

The ESLint rule `no-hardcoded-styles` flags inline style objects that contain hardcoded color hex values, font sizes, or line heights that don't match known token values. See `enforcement/no-hardcoded-styles.js`.

## Migration

See `migration.md` for the step-by-step migration plan covering the top 10 highest-impact components.