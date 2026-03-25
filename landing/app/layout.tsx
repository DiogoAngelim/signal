import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Signal - Production-Grade Backend Framework",
  description:
    "A Meteor-like backend framework redesigned for stateless, serverless, database-agnostic environments. No magic, just explicit, deterministic backend code.",
  keywords: [
    "backend framework",
    "serverless",
    "typescript",
    "meteor",
    "database-agnostic",
    "production-ready",
  ],
  authors: [{ name: "Diogo Angelim" }],
  openGraph: {
    title: "Signal - Production-Grade Backend Framework",
    description:
      "Meteor-like DX for modern serverless architectures. Stateless, database-agnostic, production-ready.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
