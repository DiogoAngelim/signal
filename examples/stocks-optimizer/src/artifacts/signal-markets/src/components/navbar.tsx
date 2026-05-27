import { useTheme } from "@/components/theme-provider";
import { Moon, Sun, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export function Navbar() {
  const { theme, setTheme } = useTheme();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#FDD000] text-black">
            <TrendingUp size={18} strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            Signal Markets
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Toggle dark mode"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center justify-center rounded-md bg-[#FDD000] px-4 py-2 text-sm font-semibold text-black shadow transition-colors hover:bg-[#ffe45c] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FDD000]"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
