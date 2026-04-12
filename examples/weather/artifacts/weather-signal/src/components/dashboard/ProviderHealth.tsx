import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { ProviderHealthView } from "@/types/weather";
import { fetchProviderHealth } from "@/lib/api";

export function ProviderHealth() {
  const [providers, setProviders] = useState<ProviderHealthView[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = () =>
      fetchProviderHealth()
        .then((data) => {
          if (mounted) {
            setProviders(data);
          }
        })
        .catch(() => {
          if (mounted) {
            setProviders([]);
          }
        });

    load();
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (providers.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 py-2">
        <AlertTriangle className="h-3 w-3 text-amber-500/70" />
        <span>Provider status pending</span>
      </div>
    );
  }

  const degraded = providers.filter((provider) => provider.status !== "healthy");

  if (degraded.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 py-2">
        <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
        <span>All data sources operational</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 py-2">
      <AlertTriangle className="h-3 w-3 text-amber-500/80" />
      <span>
        {degraded.length} provider{degraded.length > 1 ? "s" : ""} degraded
      </span>
    </div>
  );
}