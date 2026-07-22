/**
 * Color Tokens — Dyslexia-Friendly Design System
 * @module @signal/design-system/tokens/colors
 */

// ─── Text Colors ───────────────────────────────────────────────

export const text = {
  primary: "#444444",     // 7.1:1 on white
  heading: "#1a1a2e",     // 13.5:1 on white
  secondary: "#595959",   // 5.7:1 on white
  muted: "#6b6b6b",       // 4.1:1 on white
  inverse: "#ffffff",
} as const;

// ─── Status Colors ─────────────────────────────────────────────

export const status = {
  success: "#16a34a",
  error: "#dc2626",
  warning: "#ca8a04",
} as const;

export type StatusType = keyof typeof status;

export const statusConfig = {
  success: { icon: "✓", color: status.success, label: "Success" },
  error: { icon: "✗", color: status.error, label: "Error" },
  warning: { icon: "⚠", color: status.warning, label: "Warning" },
} as const;

// ─── Interactive Colors ────────────────────────────────────────

export const interactive = {
  primary: "#1a1a2e",
  primaryHover: "#2d2d4e",
  link: "#1a1a2e",
  linkVisited: "#444444",
} as const;

// ─── Background Colors ────────────────────────────────────────

export const bg = {
  primary: "#ffffff",
  card: "#ffffff",
  alternate: "#f8f9fa",
  subtle: "#f0f1f3",
} as const;

// ─── Color (legacy alias for backward compat) ─────────────────

export const color = {
  textPrimary: text.primary,
  textHeading: text.heading,
  textSecondary: text.secondary,
  textMuted: text.muted,
  textInverse: text.inverse,

  success: status.success,
  error: status.error,
  warning: status.warning,

  bgPrimary: bg.primary,
  bgCard: bg.card,
  bgAlternate: bg.alternate,
  bgSubtle: bg.subtle,

  border: "#d1d5db",
  borderLight: "#e5e7eb",

  brand: "#1a1a2e",
} as const;