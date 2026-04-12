import { Link } from "wouter";
import { Moon, Sun, Wind } from "lucide-react";
import { useWeatherStore } from "@/store/useWeatherStore";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { darkMode, toggleDarkMode } = useWeatherStore();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wind className="h-5 w-5" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Weather Signal</span>
        </Link>
        
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
            Dashboard
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="text-muted-foreground hover:text-foreground rounded-full"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </nav>
      </div>
    </header>
  );
}