import type { CSSProperties, ReactNode } from "react";
import { body, text } from "../tokens/typography";
import { contentWidth } from "../tokens/layout";
import { space } from "../tokens/spacing";

export interface ReadableParagraphProps {
  children: ReactNode;
  variant?: "default" | "secondary" | "muted";
  style?: CSSProperties;
}

const variants = {
  default: { ...body.default, color: text.primary },
  secondary: { ...body.secondary, color: text.secondary },
  muted: { ...body.muted, color: text.muted },
};

/**
 * ReadableParagraph — Enforces paragraph readability rules.
 * - maxWidth: 65ch (line length limit)
 * - lineHeight ≥ 1.65
 * - letterSpacing ≥ 0.02em
 * - Bottom margin for vertical rhythm
 */
export function ReadableParagraph({ children, variant = "default", style }: ReadableParagraphProps) {
  return (
    <p style={{ ...variants[variant], maxWidth: contentWidth.default, margin: `0 0 ${space[6]}`, ...style }}>
      {children}
    </p>
  );
}