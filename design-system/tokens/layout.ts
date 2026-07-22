/**
 * Layout Tokens — Dyslexia-Friendly Design System
 * @module @signal/design-system/tokens/layout
 */

// ─── Content Width ─────────────────────────────────────────────

export const contentWidth = {
  narrow: "55ch",    // optimal reading width
  default: "65ch",   // standard content pages
  wide: "75ch",      // tables, data-dense views
  full: "100%",
} as const;

export type ContentWidthKey = keyof typeof contentWidth;

// ─── Max Line Width (alias for content width) ──────────────────

export const maxLineWidth = {
  optimal: "55ch",
  default: "65ch",
  maximum: "75ch",
} as const;

export type MaxLineWidthKey = keyof typeof maxLineWidth;

// ─── Motion ────────────────────────────────────────────────────

export const motion = {
  durationFast: "100ms",
  durationNormal: "200ms",
  durationSlow: "300ms",
  easing: "ease-in-out",
} as const;

// ─── Reduced Motion CSS ────────────────────────────────────────

/**
 * CSS string that enforces reduced motion preferences.
 * Inject into page head or layout root.
 */
export const reducedMotionCSS = `
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;