import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/utils";
import { useWeatherStore } from "@/store/useWeatherStore";
import type { Region } from "@/types/weather";
import { Activity } from "lucide-react";

interface SummaryBarProps {
  regions: Region[];
}

export function SummaryBar({ regions }: SummaryBarProps) {
  const { lastRefreshed, refreshNow } = useWeatherStore();
  const [timeStr, setTimeStr] = useState(formatRelativeTime(new Date(lastRefreshed).toISOString()));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeStr(formatRelativeTime(new Date(lastRefreshed).toISOString()));
    }, 10000);
    return () => clearInterval(interval);
  }, [lastRefreshed]);

  const attentionRegions = regions.filter(r => r.status === "Warning" || r.status === "Critical");

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4 px-6 bg-card border rounded-xl shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
        </div>
        <h2 className="text-sm font-medium text-foreground">
          System Active
        </h2>
        <span className="text-muted-foreground text-sm">
          • {regions.length} monitored
        </span>
      </div>

      <div className="flex items-center gap-6">
        {attentionRegions.length > 0 ? (
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Activity className="h-4 w-4" />
            {attentionRegions.length} region{attentionRegions.length > 1 ? 's' : ''} require attention
          </div>
        ) : (
          <div className="text-sm font-medium text-muted-foreground">
            All clear
          </div>
        )}
        <div className="h-4 w-px bg-border hidden sm:block" />
        <button
          onClick={refreshNow}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Updated {timeStr}
        </button>
      </div>
    </div>
  );
}