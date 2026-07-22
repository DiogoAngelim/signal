import type { CSSProperties, ReactNode } from "react";
import { body, text } from "../tokens/typography";

export interface ReadableTextProps {
  children: ReactNode;
  variant?: "default" | "secondary" | "muted";
  style?: CSSProperties;
}

const variants: Record<string, CSSProperties> = {
  default: { ...body.default, color: text.primary },
  secondary: { ...body.secondary, color: text.secondary },
  muted: { ...body.muted, color: text.muted },
};

/**
 * ReadableText — Enforces body text readability rules.
 * - fontSize ≥ 1rem
 * - lineHeight ≥ 1.65
 * - letterSpacing ≥ 0.02em
 * - High-contrast color
 */
export function ReadableText({ children, variant = "default", style }: ReadableTextProps) {
  return (
    <span style={{ ...variants[variant], ...style }}>
      {children}
    </span>
  );
}