import type { Alert } from "@/types/weather";
import { getStatusConfig } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface AlertStripProps {
  alerts: Alert[];
}

export function AlertStrip({ alerts }: AlertStripProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map(alert => {
        const config = getStatusConfig(alert.severity);
        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 p-4 rounded-lg border shadow-sm"
            style={{
              backgroundColor: config.bg,
              borderColor: config.border,
            }}
          >
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: config.color }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: config.color }}>
                {alert.message}
              </p>
              <p className="text-xs mt-1" style={{ color: config.color, opacity: 0.8 }}>
                Issued {new Date(alert.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}