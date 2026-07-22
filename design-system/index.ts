/**
 * Dyslexia-Friendly Design System
 *
 * Public API — re-exports all tokens, components, layout, and enforcement.
 *
 * @module @signal/design-system
 */

// ─── Tokens ────────────────────────────────────────────────────────

export {
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
  fontWeight,
  headingScale,
} from "./tokens/typography";

export type {
  FontSizeKey,
  LineHeightKey,
  LetterSpacingKey,
  HeadingLevel,
} from "./tokens/typography";

export {
  space,
  borderRadius,
  shadow,
  border,
} from "./tokens/spacing";

export type {
  SpacingScale,
  SpacingKey,
} from "./tokens/spacing";

export {
  text,
  status,
  statusConfig,
  interactive,
  bg,
  color,
} from "./tokens/colors";

export type { StatusType } from "./tokens/colors";

export {
  contentWidth,
  maxLineWidth,
  motion,
  reducedMotionCSS,
} from "./tokens/layout";

export type {
  ContentWidthKey,
  MaxLineWidthKey,
} from "./tokens/layout";

// ─── Components ─────────────────────────────────────────────────────

export { ReadableText } from "./components/ReadableText";
export type { ReadableTextProps } from "./components/ReadableText";

export { ReadableHeading } from "./components/ReadableHeading";
export type { ReadableHeadingProps } from "./components/ReadableHeading";

export { ReadableContainer } from "./components/ReadableContainer";
export type { ReadableContainerProps } from "./components/ReadableContainer";

export { ReadableParagraph } from "./components/ReadableParagraph";
export type { ReadableParagraphProps } from "./components/ReadableParagraph";

export { ReadableCard } from "./components/ReadableCard";
export type { ReadableCardProps } from "./components/ReadableCard";

// ─── Layout ─────────────────────────────────────────────────────────

export { ReadableLayout } from "./layout/ReadableLayout";
export type { ReadableLayoutProps } from "./layout/ReadableLayout";

// ─── Enforcement ────────────────────────────────────────────────────

export {
  fontSizeToken,
  spacingToken,
  validateFontSize,
  validateLineHeight,
  validateMaxWidth,
  validateColor,
} from "./enforcement/type-enforcement";

export type {
  TokenValue,
  FontSizeToken,
  SpacingToken,
  ColorToken,
  LineHeightToken,
  LetterSpacingToken,
} from "./enforcement/type-enforcement";

export {
  noRawStyleValuesRule,
  eslintConfig,
} from "./enforcement/eslint-no-raw-style";