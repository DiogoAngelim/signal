import { ReactNode, useEffect } from "react";
import { Navbar } from "./Navbar";
import { useWeatherStore } from "@/store/useWeatherStore";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { darkMode } = useWeatherStore();

  // Ensure class is synced correctly on initial render if rehydration happens later
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground transition-colors duration-300">
      <Navbar />
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}