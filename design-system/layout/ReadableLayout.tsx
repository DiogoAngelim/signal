/**
 * ReadableLayout Component
 *
 * Page-level layout wrapper enforcing the reading comfort zone.
 * Sets font family, max content width, and vertical rhythm on the root element.
 *
 * Enforces:
 * - Max content width (65ch default)
 * - Font family on root element
 * - Vertical rhythm via spacing scale
 * - Semantic HTML element
 * - Reduced motion CSS injection
 *
 * @module @signal/design-system/layout/ReadableLayout
 */

import React from "react";
import { contentWidth, reducedMotionCSS } from "../tokens/layout";
import type { ContentWidthKey } from "../tokens/layout";
import { fontFamily } from "../tokens/typography";
import { space } from "../tokens/spacing";
import { bg } from "../tokens/colors";

// ─── Types ─────────────────────────────────────────────────────────

type LayoutElement = "div" | "main" | "section";

export interface ReadableLayoutProps {
  children: React.ReactNode;
  /** Maximum content width. Default: 'default' (65ch) */
  maxWidth?: ContentWidthKey;
  /** HTML element to render. Default: 'main' */
  as?: LayoutElement;
  /** HTML id attribute */
  id?: string;
  /** CSS class name */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────

export function ReadableLayout({
  children,
  maxWidth = "default",
  as: Element = "main",
  id,
  className,
}: ReadableLayoutProps) {
  const style: React.CSSProperties = {
    fontFamily: fontFamily.body,
    maxWidth: contentWidth[maxWidth],
    padding: `${space[6]} ${space[4]}`,
    margin: "0 auto",
    background: bg.primary,
    minHeight: "100vh",
  };

  return (
    <>
      {/* Inject reduced motion CSS */}
      <style dangerouslySetInnerHTML={{ __html: reducedMotionCSS }} />
      <Element id={id} className={className} style={style}>
        {children}
      </Element>
    </>
  );
}