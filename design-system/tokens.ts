/**
 * Dyslexia-Friendly Design System Tokens
 * Version 1.0.0
 *
 * All UI code MUST reference these tokens. No ad-hoc values.
 * Enforcement: ESLint rule `no-hardcoded-styles` catches violations.
 */

// ─── Typography ────────────────────────────────────────────────

export const fontFamily = {
  sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
} as const;

export const fontSize = {
  xs: "0.75rem",    // 12px — captions, footnotes
  sm: "0.875rem",   // 14px — labels, helper text
  base: "1rem",     // 16px — body text (minimum)
  lg: "1.125rem",   // 18px — emphasized body
  xl: "1.25rem",    // 20px — section subtitles
  "2xl": "1.5rem",  // 24px — H3 headings
  "3xl": "1.875rem", // 30px — H2 headings
  "4xl": "2.25rem", // 36px — H1 page titles
} as const;

export const lineHeight = {
  tight: "1.25",    // headings only
  normal: "1.5",    // UI labels, short text
  relaxed: "1.65",  // body paragraphs (minimum for readability)
  loose: "2.0",     // large text blocks, dyslexia-optimized
} as const;

export const letterSpacing = {
  normal: "0.02em",  // body text (minimum)
  wide: "0.04em",    // headings
  wider: "0.06em",   // uppercase labels
} as const;

export const fontWeight = {
  normal: 400,
  semibold: 600,
  bold: 700,
} as const;

// ─── Spacing ───────────────────────────────────────────────────

export const spacing = {
  1: "0.25rem",  // 4px
  2: "0.5rem",   // 8px
  3: "0.75rem",  // 12px
  4: "1rem",     // 16px
  5: "1.25rem",  // 20px
  6: "1.5rem",   // 24px
  8: "2rem",     // 32px
  10: "2.5rem",  // 40px
  12: "3rem",    // 48px
} as const;

// ─── Colors ────────────────────────────────────────────────────

export const color = {
  textPrimary: "#444444",    // 7.1:1 on white
  textHeading: "#1a1a2e",    // 13.5:1 on white
  textSecondary: "#595959",  // 5.7:1 on white
  textMuted: "#6b6b6b",      // 4.1:1 on white
  textInverse: "#ffffff",

  success: "#16a34a",
  error: "#dc2626",
  warning: "#ca8a04",

  bgPrimary: "#ffffff",
  bgCard: "#ffffff",
  bgAlternate: "#f8f9fa",
  bgSubtle: "#f0f1f3",

  border: "#d1d5db",
  borderLight: "#e5e7eb",

  brand: "#1a1a2e",
} as const;

// ─── Layout ────────────────────────────────────────────────────

export const contentWidth = {
  narrow: "55ch",   // optimal reading width
  default: "65ch",  // standard content pages
  wide: "75ch",     // tables, data-dense views
  full: "100%",
} as const;

export const borderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,0.1)",
  subtle: "0 1px 2px rgba(0,0,0,0.05)",
} as const;

// ─── Composite Styles ──────────────────────────────────────────

export const heading = {
  h1: {
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.wide,
    color: color.textHeading,
    margin: "0 0 2rem",
  } as const,
  h2: {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.wide,
    color: color.textHeading,
    margin: "0 0 1rem",
  } as const,
  h3: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: "1.3",
    letterSpacing: letterSpacing.normal,
    color: color.textHeading,
    margin: "0 0 1rem",
  } as const,
} as const;

export const body = {
  default: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
    letterSpacing: letterSpacing.normal,
    color: color.textPrimary,
  } as const,
  secondary: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
    letterSpacing: letterSpacing.normal,
    color: color.textSecondary,
  } as const,
  muted: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
    color: color.textMuted,
  } as const,
} as const;

export const label = {
  default: {
    display: "block",
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: 6,
    color: color.textHeading,
    letterSpacing: letterSpacing.normal,
  } as const,
} as const;

export const input = {
  default: {
    width: "100%",
    padding: "0.6rem 0.75rem",
    border: `1px solid ${color.border}`,
    borderRadius: borderRadius.md,
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
  } as const,
} as const;

export const card = {
  default: {
    background: color.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing[6],
    boxShadow: shadow.card,
  } as const,
} as const;

export const button = {
  primary: {
    background: color.brand,
    color: color.textInverse,
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: borderRadius.md,
    cursor: "pointer",
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.normal,
  } as const,
} as const;

export const statusIcon = {
  success: "✓",
  error: "✗",
  warning: "⚠",
} as const;