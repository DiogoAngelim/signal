import type { CSSProperties, ReactNode } from "react";
import { contentWidth } from "../tokens/layout";
import type { ContentWidthKey } from "../tokens/layout";
import { space } from "../tokens/spacing";
import { bg } from "../tokens/colors";
import { fontFamily } from "../tokens/typography";

export interface ReadableLayoutProps {
  width?: ContentWidthKey;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * ReadableLayout — Page-level layout wrapper enforcing reading comfort.
 * - Enforces max-width (reading comfort zone)
 * - Enforces vertical rhythm consistency
 * - Sets base font family and background
 * - Centers content horizontally
 */
export function ReadableLayout({ width = "default", children, style }: ReadableLayoutProps) {
  return (
    <div style={{
      maxWidth: contentWidth[width],
      margin: "0 auto",
      padding: `${space[8]} ${space[4]}`,
      fontFamily: fontFamily.body,
      background: bg.primary,
      minHeight: "100vh",
      ...style,
    }}>
      {children}
    </div>
  );
}