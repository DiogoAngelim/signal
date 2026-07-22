/**
 * Type-Level Enforcement
 *
 * Branded types that prevent accidental use of raw string values
 * where design token values are expected. Components accept only
 * branded types, making raw string assignment a compile-time error.
 *
 * @module @signal/design-system/enforcement/type-enforcement
 */

// ─── Branded Type Primitives ───────────────────────────────────────

/**
 * Branded type for token values. The `__token` brand prevents
 * accidental assignment of plain strings where token values are required.
 */
export type TokenValue<T extends string> = { __token: T; value: string };

// ─── Specific Token Types ───────────────────────────────────────────

/** Branded type for font-size token values */
export type FontSizeToken = TokenValue<"fontSize">;

/** Branded type for spacing token values */
export type SpacingToken = TokenValue<"spacing">;

/** Branded type for color token values */
export type ColorToken = TokenValue<"color">;

/** Branded type for line-height token values */
export type LineHeightToken = TokenValue<"lineHeight">;

/** Branded type for letter-spacing token values */
export type LetterSpacingToken = TokenValue<"letterSpacing">;

// ─── Token Constructors ─────────────────────────────────────────────

import { fontSize } from "../tokens/typography";
import type { FontSizeKey } from "../tokens/typography";
import { space } from "../tokens/spacing";
import type { SpacingKey } from "../tokens/spacing";

/** Create a branded font-size token */
export function fontSizeToken(key: FontSizeKey): FontSizeToken {
  return { __token: "fontSize", value: fontSize[key] };
}

/** Create a branded spacing token */
export function spacingToken(key: SpacingKey): SpacingToken {
  return { __token: "spacing", value: space[key] };
}

// ─── Runtime Validation ─────────────────────────────────────────────

/**
 * Runtime validation for design system compliance.
 * Only active in development mode. Logs warnings for violations.
 */

const isDev = typeof process !== "undefined" && process.env?.NODE_ENV === "development";

/**
 * Validate that a font size meets the minimum threshold.
 * Logs a warning if the size is below 0.875rem (14px).
 */
export function validateFontSize(componentName: string, size: string): boolean {
  if (!isDev) return true;

  const remMatch = size.match(/^(\d+(?:\.\d+)?)rem$/);
  if (!remMatch) return true;

  const rem = Number.parseFloat(remMatch[1]);
  if (rem < 0.875) {
    console.warn(
      `[DesignSystem] ${componentName}: font-size "${size}" is below the minimum 0.875rem (14px). ` +
      `Use fontSize tokens from '@signal/design-system/tokens/typography'.`
    );
    return false;
  }
  return true;
}

/**
 * Validate that a line height meets the minimum threshold.
 * Logs a warning if the line height is below 1.25.
 */
export function validateLineHeight(componentName: string, height: number): boolean {
  if (!isDev) return true;

  if (height < 1.25) {
    console.warn(
      `[DesignSystem] ${componentName}: line-height ${height} is below the minimum 1.25. ` +
      `Use lineHeight tokens from '@signal/design-system/tokens/typography'.`
    );
    return false;
  }
  return true;
}

/**
 * Validate that a max width constraint exists for text blocks.
 * Logs a warning if no maxWidth is set.
 */
export function validateMaxWidth(componentName: string, maxWidth: string | undefined): boolean {
  if (!isDev) return true;

  if (!maxWidth) {
    console.warn(
      `[DesignSystem] ${componentName}: No maxWidth set. ` +
      `Text blocks should be constrained to maxLineWidth tokens (max 75ch).`
    );
    return false;
  }
  return true;
}

/**
 * Validate that a color value is from the token palette.
 * Logs a warning if a raw hex/rgb value is detected.
 */
export function validateColor(componentName: string, color: string): boolean {
  if (!isDev) return true;

  if (/^#[0-9a-fA-F]{3,8}$/.test(color) || /^rgb[a]?\(/.test(color)) {
    console.warn(
      `[DesignSystem] ${componentName}: Raw color "${color}" detected. ` +
      `Use color tokens from '@signal/design-system/tokens/colors'.`
    );
    return false;
  }
  return true;
}