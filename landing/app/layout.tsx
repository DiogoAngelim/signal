import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal",
  description:
    "Signal helps teams understand operational workflows through clear queries, mutations, events, and evidence.",
  keywords: [
    "operational clarity",
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
      "Signal keeps workflow understanding first, with reasoning and evidence available when teams need more detail.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f6",
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
