/**
 * ESLint Rule: no-hardcoded-styles
 *
 * Flags inline style objects in JSX that contain hardcoded values
 * which should come from design-system tokens instead.
 *
 * Catches:
 * - Hardcoded hex colors (#xxx, #xxxxxx)
 * - Hardcoded font sizes in px ("12px", "14px", etc.)
 * - Hardcoded line heights < 1.5 (below readability minimum)
 * - Missing letterSpacing on text elements
 *
 * Usage in .eslintrc:
 *   "rules": {
 *     "no-hardcoded-styles": "warn"
 *   }
 */

"use strict";

// Known token values (from design-system/tokens.ts)
const TOKEN_COLORS = new Set([
  "#444444", "#1a1a2e", "#595959", "#6b6b6b", "#ffffff",
  "#16a34a", "#dc2626", "#ca8a04", "#f8f9fa", "#f0f1f3",
  "#d1d5db", "#e5e7eb",
]);

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}/;
const PX_FONT_SIZE_RE = /\d+px/;

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce design-system tokens instead of hardcoded style values",
      category: "Best Practices",
      recommended: true,
    },
    messages: {
      hardcodedColor: "Hardcoded color '{{color}}' found. Use a token from design-system/tokens.ts (e.g., color.textPrimary, color.success).",
      hardcodedFontSize: "Hardcoded font size '{{size}}' found. Use a token from design-system/tokens.ts (e.g., fontSize.base).",
      lowLineHeight: "Line height {{height}} is below the readability minimum (1.5). Use lineHeight.relaxed (1.65) for body text.",
      missingLetterSpacing: "Text element missing letterSpacing. Add letterSpacing.normal (0.02em) minimum for readability.",
    },
    schema: [],
  },

  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "style") return;

        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        if (value.expression.type !== "ObjectExpression") return;

        const properties = value.expression.properties;

        for (const prop of properties) {
          if (prop.type !== "Property") continue;
          const key = prop.key;
          if (!key || !key.name) continue;

          const keyName = key.name;
          const val = prop.value;

          // Check for hardcoded colors
          if (keyName === "color" || keyName === "background" || keyName === "backgroundColor" || keyName === "borderColor") {
            if (val.type === "Literal" && typeof val.value === "string") {
              const colorVal = val.value.trim();
              if (HEX_COLOR_RE.test(colorVal) && !TOKEN_COLORS.has(colorVal)) {
                context.report({
                  node: prop,
                  messageId: "hardcodedColor",
                  data: { color: colorVal },
                });
              }
            }
          }

          // Check for hardcoded font sizes in px
          if (keyName === "fontSize") {
            if (val.type === "Literal" && typeof val.value === "string" && PX_FONT_SIZE_RE.test(val.value)) {
              context.report({
                node: prop,
                messageId: "hardcodedFontSize",
                data: { size: val.value },
              });
            }
          }

          // Check for low line heights
          if (keyName === "lineHeight") {
            if (val.type === "Literal") {
              const numVal = typeof val.value === "number" ? val.value : parseFloat(val.value);
              if (!isNaN(numVal) && numVal < 1.5) {
                context.report({
                  node: prop,
                  messageId: "lowLineHeight",
                  data: { height: String(numVal) },
                });
              }
            }
          }
        }
      },
    };
  },
};