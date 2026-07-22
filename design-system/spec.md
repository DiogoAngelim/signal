# Dyslexia-Friendly Design System Specification

## Version: 1.0.0
## Status: Production

---

## 1. Typography Rules

### 1.1 Base Font Size System
| Token | Value | Usage |
|-------|-------|-------|
| `text-xs` | 0.75rem (12px) | Captions, footnotes |
| `text-sm` | 0.875rem (14px) | Labels, helper text |
| `text-base` | 1rem (16px) | Body text (minimum) |
| `text-lg` | 1.125rem (18px) | Emphasized body |
| `text-xl` | 1.25rem (20px) | Section subtitles |
| `text-2xl` | 1.5rem (24px) | H3 headings |
| `text-3xl` | 1.875rem (30px) | H2 headings |
| `text-4xl` | 2.25rem (36px) | H1 page titles |

### 1.2 Line Height Rules
| Token | Value | Usage |
|-------|-------|-------|
| `leading-tight` | 1.25 | Headings only |
| `leading-normal` | 1.5 | UI labels, short text |
| `leading-relaxed` | 1.65 | Body paragraphs (minimum for readability) |
| `leading-loose` | 2.0 | Large text blocks, dyslexia-optimized |

### 1.3 Letter Spacing Rules
| Token | Value | Usage |
|-------|-------|-------|
| `tracking-tight` | -0.01em | Never use (violates readability) |
| `tracking-normal` | 0.02em | Body text (minimum) |
| `tracking-wide` | 0.04em | Headings |
| `tracking-wider` | 0.06em | Uppercase labels |

### 1.4 Max Line Width Constraint
- **Hard limit**: 75ch (approximately 75 characters per line)
- **Optimal reading zone**: 55–65ch
- **Enforcement**: All text containers MUST set `maxWidth: "75ch"` or less

### 1.5 Heading Hierarchy Rules
- H1: 2.25rem, fontWeight 700, lineHeight 1.25, letterSpacing 0.04em
- H2: 1.5rem, fontWeight 600, lineHeight 1.25, letterSpacing 0.04em
- H3: 1.25rem, fontWeight 600, lineHeight 1.3, letterSpacing 0.02em
- No heading level may be skipped (H1 → H3 forbidden)
- Headings must use high-contrast color (#1a1a2e on light backgrounds)

---

## 2. Layout Rules

### 2.1 Content Width Constraints
| Token | Value | Usage |
|-------|-------|-------|
| `content-narrow` | 55ch | Optimal reading width |
| `content-default` | 65ch | Standard content pages |
| `content-wide` | 75ch | Tables, data-dense views |
| `content-full` | 100% | Full-width layouts (avoid for text) |

### 2.2 Spacing Scale
| Token | Value | Rem |
|-------|-------|-----|
| `space-1` | 0.25rem | 4px |
| `space-2` | 0.5rem | 8px |
| `space-3` | 0.75rem | 12px |
| `space-4` | 1rem | 16px |
| `space-5` | 1.25rem | 20px |
| `space-6` | 1.5rem | 24px |
| `space-8` | 2rem | 32px |
| `space-10` | 2.5rem | 40px |
| `space-12` | 3rem | 48px |

### 2.3 Section Separation Rules
- Between page title and content: 2rem (space-8)
- Between sections within a page: 1.5rem (space-6)
- Between items in a list: 0.75rem (space-3)
- Between form fields: 1.5rem (space-6)
- Between label and input: 6px

### 2.4 Text Block Chunking Rules
- Paragraphs must not exceed 65ch width
- Lists must have minimum 0.75rem vertical spacing between items
- Evidence/detail blocks must use card containers with padding ≥ 1rem
- Alternating row backgrounds for table readability

---

## 3. Color Rules

### 3.1 Contrast Enforcement Rules
| Context | Minimum Ratio | Token |
|---------|---------------|-------|
| Body text on white | 4.5:1 | `text-primary` (#444444 on #fff = 7.1:1) |
| Heading text on white | 7:1 | `text-heading` (#1a1a2e on #fff = 13.5:1) |
| Secondary text on white | 4.5:1 | `text-secondary` (#595959 on #fff = 5.7:1) |
| Muted text on white | 3:1 | `text-muted` (#6b6b6b on #fff = 4.1:1) |

### 3.2 Background Constraints for Text Areas
- Primary background: #ffffff (white)
- Card background: #ffffff with subtle shadow
- Alternate row: #f8f9fa
- Result/info block: #f8f9fa
- Never use patterned or image backgrounds behind text

### 3.3 Disabled Reliance on Color-Only Meaning
- Status indicators MUST include icon prefix (✓, ✗, ⚠)
- Error messages MUST include icon + text, not just red color
- Success states MUST include icon + text, not just green color
- Warning states MUST include icon + text, not just yellow color
- Links MUST be underlined, not just colored

---

## 4. Interaction Rules

### 4.1 Label Visibility Rules
- All form inputs MUST have visible labels (no placeholder-only labels)
- Labels MUST use `text-sm` (0.875rem), fontWeight 600
- Labels MUST be positioned above the input (not inline/left)
- Label-to-input spacing: 6px minimum

### 4.2 Error Message Placement Rules
- Error messages MUST appear directly below the relevant input
- Error messages MUST use color (#dc2626) + icon (✗) + text
- Error messages MUST use `text-base` minimum (no smaller)
- Error messages MUST have `lineHeight: 1.5` minimum

### 4.3 Feedback Clarity Rules
- Loading states MUST show text ("Loading…", "Evaluating…")
- Disabled buttons MUST show text change ("Capturing…" vs "Capture")
- Action results MUST be displayed in a clearly bounded container
- Boolean results MUST use icon + color + text triple encoding

---

## 5. Motion Rules

### 5.1 Reduced Motion Compliance
- All animations MUST respect `prefers-reduced-motion: reduce`
- When reduced motion is preferred, disable all non-essential animations
- Transition durations MUST NOT exceed 200ms

### 5.2 Animation Restrictions Near Text
- No text shall animate (fade, slide, scale) while being read
- Page transitions MUST NOT cause text to move horizontally
- Loading indicators near text MUST be static (spinner or text, not both)
- Hover effects on text MUST NOT change font-size or letter-spacing

---

## 6. Font Family

### 6.1 Primary Font Stack
```
system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
```

### 6.2 Monospace Font Stack (code, IDs)
```
ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace
```

### 6.3 Font Rules
- Never use decorative or display fonts for body text
- Font weight range: 400 (normal) to 700 (bold) only
- Never use font-weight below 400
- Never use italic for emphasis in body text (use bold instead)