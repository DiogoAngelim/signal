import type { CSSProperties, ReactNode } from "react";
import { contentWidth } from "../tokens/layout";
import type { ContentWidthKey } from "../tokens/layout";

export interface ReadableContainerProps {
  width?: ContentWidthKey;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * ReadableContainer — Enforces max-width reading comfort zone.
 * - Default: 65ch (optimal reading width)
 * - Hard limit: 75ch (never wider for text content)
 * - Prevents eye-strain from wide text lines
 */
export function ReadableContainer({ width = "default", children, style }: ReadableContainerProps) {
  return (
    <div style={{ maxWidth: contentWidth[width], ...style }}>
      {children}
    </div>
  );
}