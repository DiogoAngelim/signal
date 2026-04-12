import { useEffect, useState } from "react";
import type { LiveUpdate } from "@/types/weather";
import { fetchRecentUpdates, subscribeToUpdates } from "@/lib/api";
import { formatRelativeTime, getStatusConfig } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";

export function LiveUpdatesFeed() {
  const [updates, setUpdates] = useState<LiveUpdate[]>([]);

  useEffect(() => {
    let unsubscribe: () => void;

    fetchRecentUpdates().then((data) => {
      setUpdates(data.slice(0, 10));
    }).catch(() => {
      setUpdates([]);
    });

    subscribeToUpdates((update) => {
      setUpdates((prev) => [update, ...prev].slice(0, 10));
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <div className="bg-card rounded-xl border shadow-sm flex flex-col h-full">
      <div className="p-4 border-b flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium text-sm text-foreground">Live Updates</h3>
      </div>
      <div className="p-2 flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto p-2 scrollbar-thin">
          <AnimatePresence initial={false}>
            {updates.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">Waiting for updates...</div>
            ) : (
              updates.map((update) => {
                const config = getStatusConfig(update.status);
                return (
                  <motion.div
                    key={update.id + update.timestamp}
                    initial={{ opacity: 0, height: 0, scale: 0.95 }}
                    animate={{ opacity: 1, height: "auto", scale: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-2"
                  >
                    <div className="p-3 rounded-lg border bg-background/50 hover:bg-background transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-foreground">{update.regionName}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(update.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: config.color }}
                        />
                        <p className="text-xs text-muted-foreground leading-snug">
                          {update.message}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}