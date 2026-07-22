import type { CSSProperties, ReactNode } from "react";
import { headingScale, text } from "../tokens/typography";
import type { HeadingLevel } from "../tokens/typography";

export interface ReadableHeadingProps {
  level: HeadingLevel;
  children: ReactNode;
  style?: CSSProperties;
}

const headingStyles: Record<number, CSSProperties> = {
  1: { ...headingScale.h1, color: text.heading },
  2: { ...headingScale.h2, color: text.heading },
  3: { ...headingScale.h3, color: text.heading },
};

/**
 * ReadableHeading — Enforces heading readability rules.
 * - Enforces heading hierarchy (1/2/3)
 * - High-contrast color (#1a1a2e)
 * - letterSpacing ≥ 0.02em
 * - lineHeight ≤ 1.3 (tight for headings)
 */
export function ReadableHeading({ level, children, style }: ReadableHeadingProps) {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return (
    <Tag style={{ ...headingStyles[level], ...style }}>
      {children}
    </Tag>
  );
}