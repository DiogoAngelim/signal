# Audit Report — Dyslexia-Friendly Design System

## Date: 2026-06-14
## Scope: Frontend UI Layer (`frontend/src/`)

---

## 1. Current Readability Risks

### Critical
- **No line length constraints**: Text containers had no `maxWidth`, allowing lines to stretch across full viewport width (1000px+ on wide screens)
- **Insufficient line height**: Body text used `lineHeight: 1` or default (1.2), well below the 1.65 minimum for dyslexia-friendly reading
- **No letter spacing**: Zero `letterSpacing` on any text element, making character discrimination difficult
- **Low-contrast text**: Secondary text used `#666` on white (4.0:1 — borderline WCAG AA) and `#999` on white (2.8:1 — fails WCAG AA)

### High
- **Color-only status indicators**: Status badges relied solely on color (green/red/yellow) without icon or text redundancy
- **Inconsistent font sizes**: Pages used ad-hoc sizes (`0.85rem`, `0.9rem`, `0.875rem`, `1rem`, `1.5rem`) with no systematic scale
- **No heading hierarchy**: H1 elements used `fontSize: "1.5rem"` (same as some H2s), breaking document outline

### Medium
- **Inconsistent spacing**: Form fields, card padding, and section gaps used arbitrary values with no rhythm
- **No reduced-motion support**: No `prefers-reduced-motion` media queries
- **Missing labels on some inputs**: Form inputs relied on placeholder text

---

## 2. Inconsistent Patterns

| Pattern | Variants Found | Correct Per Spec |
|---------|---------------|-----------------|
| Body font size | `0.85rem`, `0.9rem`, `0.9375rem`, `1rem` | `1rem` (minimum) |
| Line height | `1`, `1.2`, `1.5`, `1.65` | `1.65` (body), `1.25` (headings) |
| Letter spacing | `0`, `0.02em` | `0.02em` (body), `0.04em` (headings) |
| Card padding | `1rem`, `1.5rem`, `2rem` | `1.5rem` |
| Max width | `none`, `600px`, `65ch` | `65ch` (default), `75ch` (max) |
| Status display | Color-only | Color + icon + text |

---

## 3. Font/Spacing/Contrast Issues

### Font Issues
- 4 different body font sizes across pages
- No consistent heading scale
- Monospace code blocks used `0.85rem` (too small for readability)

### Spacing Issues
- Form field gaps: `12px`, `16px`, `24px` (no systematic scale)
- Section separation: `1rem`, `1.5rem`, `2rem` (inconsistent)
- Card padding: `1rem` vs `1.5rem` vs `2rem`

### Contrast Issues
- `#666` on `#fff` = 4.0:1 (borderline AA, fails for large text)
- `#999` on `#fff` = 2.8:1 (fails AA)
- `#aaa` on `#fff` = 2.0:1 (fails all standards)
- Status green `#16a34a` on `#fff` = 3.7:1 (passes AA for large text only)

---

## 4. High-Impact Refactor Points

1. **App.tsx global styles** — Sets baseline for all pages; highest leverage point
2. **DashboardPage** — Densest text content, most visible page
3. **DecisionsPage** — Table with status colors; triple-encoding needed
4. **DecisionDetailPage** — Evidence list; chunking and spacing critical
5. **NoteDetailPage / PostDetailPage** — Long-form text; line length and height critical
6. **All form pages** — Label visibility and spacing standardization

---

## 5. Remediation Summary

All identified issues have been addressed in the implementation:
- ✅ Line length constrained to 65–75ch across all pages
- ✅ Line height set to 1.65 for body, 1.25 for headings
- ✅ Letter spacing set to 0.02em (body) and 0.04em (headings)
- ✅ Text colors upgraded to WCAG AA+ contrast ratios
- ✅ Status indicators use icon + color + text triple encoding
- ✅ Consistent font size scale (1rem body, 2.25rem H1)
- ✅ Systematic spacing scale (0.25rem–3rem)
- ✅ Design tokens enforce all values
- ✅ ESLint rule prevents regression