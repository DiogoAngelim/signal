/**
 * Spacing Tokens — Dyslexia-Friendly Design System
 * @module @signal/design-system/tokens/spacing
 */

// ─── Spacing Scale ─────────────────────────────────────────────

export const space = {
  1: "0.25rem",   // 4px
  2: "0.5rem",    // 8px
  3: "0.75rem",   // 12px
  4: "1rem",      // 16px
  5: "1.25rem",   // 20px
  6: "1.5rem",    // 24px
  8: "2rem",      // 32px
  10: "2.5rem",   // 40px
  12: "3rem",     // 48px
} as const;

export type SpacingScale = typeof space;
export type SpacingKey = keyof SpacingScale;

// ─── Border Radius ─────────────────────────────────────────────

export const borderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

// ─── Shadow ────────────────────────────────────────────────────

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,0.1)",
  subtle: "0 1px 2px rgba(0,0,0,0.05)",
} as const;

// ─── Border ───────────────────────────────────────────────────

export const border = {
  default: "1px solid #d1d5db",
  light: "1px solid #e5e7eb",
} as const;