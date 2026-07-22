/**
 * ESLint Rule: no-raw-style-values
 *
 * Prevents inline style objects that contain raw typography, spacing, or color
 * values instead of design token references. This is the enforcement layer
 * that prevents bypassing the design system.
 *
 * Flagged properties:
 * - fontSize with raw values (should use fontSize tokens)
 * - lineHeight with raw values (should use lineHeight tokens)
 * - letterSpacing with raw values (should use letterSpacing tokens)
 * - color with hex/rgb values (should use color tokens)
 * - padding/margin with raw pixel values (should use space tokens)
 *
 * Allowed:
 * - Style props that reference token values (variable references)
 * - Layout-only properties (display, position, grid, flex, etc.)
 * - Properties in design-system/ files themselves
 *
 * @module @signal/design-system/enforcement/eslint-no-raw-style
 */

const RULE_NAME = "no-raw-style-values";

// Properties that should use design tokens
const TYPOGRAPHY_PROPS = ["fontSize", "lineHeight", "letterSpacing", "fontWeight"];
const COLOR_PROPS = ["color", "backgroundColor"];
const SPACING_PROPS = ["padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap"];

// Layout-only properties that are always allowed
const LAYOUT_ONLY_PROPS = new Set([
  "display", "position", "top", "right", "bottom", "left", "zIndex",
  "flex", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis",
  "grid", "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
  "alignItems", "alignSelf", "alignContent", "justifyContent", "justifySelf", "justifyItems",
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "overflow", "overflowX", "overflowY",
  "border", "borderRadius", "borderWidth", "borderStyle", "borderColor",
  "boxShadow", "opacity", "cursor", "pointerEvents", "userSelect",
  "transition", "transform", "animation",
  "listStyle", "listStyleType", "tableLayout", "borderCollapse",
  "whiteSpace", "wordBreak", "wordWrap", "textOverflow", "textTransform",
  "verticalAlign", "textAlign", "textDecoration",
]);

// Patterns that indicate raw values (not token references)
const RAW_VALUE_PATTERNS = {
  fontSize: /^\d+(\.\d+)?(rem|px|em|vh|vw)$/,
  lineHeight: /^\d+(\.\d+)?$/,
  letterSpacing: /^0(\.\d+)?em$/,
  color: /^#[0-9a-fA-F]{3,8}$|^rgb[a]?\(/,
  spacing: /^\d+(\.\d+)?(rem|px)$/,
};

/**
 * Check if a property value looks like a raw value vs a token reference
 */
function isRawValue(prop: string, value: string): boolean {
  if (typeof value !== "string") return false;

  if (TYPOGRAPHY_PROPS.includes(prop)) {
    return RAW_VALUE_PATTERNS.fontSize.test(value) ||
           RAW_VALUE_PATTERNS.lineHeight.test(value) ||
           RAW_VALUE_PATTERNS.letterSpacing.test(value);
  }

  if (COLOR_PROPS.includes(prop)) {
    return RAW_VALUE_PATTERNS.color.test(value);
  }

  if (SPACING_PROPS.includes(prop)) {
    return RAW_VALUE_PATTERNS.spacing.test(value);
  }

  return false;
}

/**
 * ESLint rule definition
 */
export const noRawStyleValuesRule = {
  meta: {
    type: "suggestion" as const,
    docs: {
      description: "Prevent raw style values that should use design system tokens",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      rawTypography: "Use typography tokens from '@signal/design-system/tokens/typography' instead of raw '{{prop}}' value '{{value}}'.",
      rawColor: "Use color tokens from '@signal/design-system/tokens/colors' instead of raw '{{prop}}' value '{{value}}'.",
      rawSpacing: "Use spacing tokens from '@signal/design-system/tokens/spacing' instead of raw '{{prop}}' value '{{value}}'.",
    },
    schema: [],
  },

  create(context: { report: (arg: any) => void; getFilename: () => string }) {
    const filename = context.getFilename();

    // Skip design-system files themselves
    if (filename.includes("design-system/")) {
      return {};
    }

    return {
      // Detect JSX style props with raw values
      JSXAttribute(node: any) {
        if (node.name?.name !== "style") return;

        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;

        const expression = value.expression;
        if (!expression || expression.type !== "ObjectExpression") return;

        for (const property of expression.properties) {
          if (property.type !== "Property") continue;

          const prop = property.key?.name;
          if (!prop || LAYOUT_ONLY_PROPS.has(prop)) continue;

          const valueNode = property.value;
          if (!valueNode || valueNode.type !== "Literal") continue;

          const rawValue = String(valueNode.value);
          if (!isRawValue(prop, rawValue)) continue;

          let messageId = "rawSpacing";
          if (TYPOGRAPHY_PROPS.includes(prop)) messageId = "rawTypography";
          else if (COLOR_PROPS.includes(prop)) messageId = "rawColor";

          context.report({
            node: property,
            messageId,
            data: { prop, value: rawValue },
          });
        }
      },
    };
  },
};

/**
 * ESLint config helper — add this rule to your ESLint config
 *
 * Usage in .eslintrc.js:
 *   plugins: ['@signal/design-system'],
 *   rules: {
 *     '@signal/design-system/no-raw-style-values': 'warn',
 *   }
 */
export const eslintConfig = {
  plugins: ["@signal/design-system"],
  rules: {
    "@signal/design-system/no-raw-style-values": "warn",
  },
};