import type { CSSProperties, ReactNode } from "react";
import { bg } from "../tokens/colors";
import { borderRadius, shadow, space } from "../tokens/spacing";

export interface ReadableCardProps {
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * ReadableCard — Enforces card container readability rules.
 * - White background with subtle shadow
 * - Consistent padding (1.5rem)
 * - Rounded corners (8px)
 * - Provides visual chunking for content blocks
 */
export function ReadableCard({ children, style }: ReadableCardProps) {
  return (
    <div style={{
      background: bg.card,
      borderRadius: borderRadius.lg,
      padding: space[6],
      boxShadow: shadow.card,
      ...style,
    }}>
      {children}
    </div>
  );
}