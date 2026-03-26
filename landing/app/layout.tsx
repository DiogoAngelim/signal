import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal",
  description:
    "Signal is a transport-agnostic application protocol for queries, mutations, and events.",
  keywords: [
    "application protocol",
    "queries",
    "mutations",
    "events",
    "typescript",
    "node",
  ],
  authors: [{ name: "Diogo Angelim" }],
  openGraph: {
    title: "Signal",
    description:
      "Signal defines envelopes, semantics, and bindings for versioned queries, mutations, and events.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
