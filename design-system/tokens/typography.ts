/**
 * Typography Tokens — Dyslexia-Friendly Design System
 * @module @signal/design-system/tokens/typography
 */

// ─── Font Family ────────────────────────────────────────────────

export const fontFamily = {
  body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  heading: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
} as const;

// ─── Font Size Scale ───────────────────────────────────────────

export const fontSize = {
  xs: "0.75rem",     // 12px — captions, footnotes
  sm: "0.875rem",    // 14px — labels, helper text
  base: "1rem",      // 16px — body text (minimum)
  lg: "1.125rem",    // 18px — emphasized body
  xl: "1.25rem",     // 20px — section subtitles
  "2xl": "1.5rem",   // 24px — H3 headings
  "3xl": "1.875rem", // 30px — H2 headings
  "4xl": "2.25rem",  // 36px — H1 page titles
} as const;

export type FontSizeKey = keyof typeof fontSize;

// ─── Line Height ───────────────────────────────────────────────

export const lineHeight = {
  tight: "1.25",     // headings only
  normal: "1.5",     // UI labels, short text
  relaxed: "1.65",   // body paragraphs (minimum for readability)
  loose: "2.0",      // large text blocks, dyslexia-optimized
} as const;

export type LineHeightKey = keyof typeof lineHeight;

// ─── Letter Spacing ────────────────────────────────────────────

export const letterSpacing = {
  normal: "0.02em",   // body text (minimum)
  wide: "0.04em",     // headings
  wider: "0.06em",    // uppercase labels
} as const;

export type LetterSpacingKey = keyof typeof letterSpacing;

// ─── Font Weight ───────────────────────────────────────────────

export const fontWeight = {
  normal: 400,
  semibold: 600,
  bold: 700,
} as const;

// ─── Heading Scale ─────────────────────────────────────────────

export const headingScale = {
  h1: {
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.wide,
  },
  h2: {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.wide,
  },
  h3: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: "1.3",
    letterSpacing: letterSpacing.normal,
  },
} as const;

export type HeadingLevel = 1 | 2 | 3;

// ─── Composite: Body Text ──────────────────────────────────────

export const body = {
  default: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  secondary: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
    letterSpacing: letterSpacing.normal,
  },
  muted: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.normal,
    letterSpacing: letterSpacing.normal,
  },
} as const;

// ─── Composite: Label ──────────────────────────────────────────

export const label = {
  default: {
    display: "block" as const,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: 6,
    letterSpacing: letterSpacing.normal,
  },
} as const;