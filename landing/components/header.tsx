"use client";

import { cn } from "@/lib/utils";
import { BookOpen, CircleDot, GitBranch, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "#understanding", label: "Understanding" },
  { href: "#reasoning", label: "Reasoning" },
  { href: "#evidence", label: "Evidence" },
  { href: "#practice", label: "Practice" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 z-50 border-b transition-colors duration-300",
        isScrolled || isMobileMenuOpen
          ? "border-border bg-background/92 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto max-w-7xl px-6 py-4 sm:px-8 lg:px-12">
        <nav className="flex items-center justify-between gap-6">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
              <CircleDot className="h-5 w-5" />
            </span>
            <span className="truncate text-lg font-semibold tracking-normal text-foreground">
              Signal
            </span>
          </a>

          <div className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href="/docs/what-is-signal"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </a>
            <a
              href="https://github.com/DiogoAngelim/signal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <GitBranch className="h-4 w-4" />
              GitHub
            </a>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </nav>

        {isMobileMenuOpen ? (
          <div className="mt-4 border-t border-border pt-4 md:hidden">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-2 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/docs/what-is-signal"
                className="rounded-lg px-2 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Docs
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
