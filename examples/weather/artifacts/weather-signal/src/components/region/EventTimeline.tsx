import type { RegionEvent } from "@/types/weather";
import { formatRelativeTime } from "@/lib/utils";

interface EventTimelineProps {
  events: RegionEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (!events || events.length === 0) return null;

  return (
    <div className="space-y-4">
      {events.map((event, idx) => (
        <div key={event.id} className="relative flex gap-4">
          {/* Line */}
          {idx !== events.length - 1 && (
            <div className="absolute left-[7px] top-6 bottom-[-16px] w-px bg-border" />
          )}

          <div className="mt-1.5 relative z-10">
            <div className="w-[15px] h-[15px] rounded-full border-2 border-background bg-muted-foreground/30 ring-1 ring-border" />
          </div>

          <div className="flex-1 pb-1">
            <p className="text-sm font-medium text-foreground">
              {event.description}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRelativeTime(event.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}