import type { Region } from "@/types/weather";
import { RegionCard } from "./RegionCard";
import { Skeleton } from "@/components/ui/skeleton";

interface RegionGridProps {
  regions: Region[];
  isLoading: boolean;
  notifiedRegionIds?: Set<string>;
  notificationsDisabled?: boolean;
  onToggleNotify?: (regionId: string) => void;
}

export function RegionGrid({
  regions,
  isLoading,
  notifiedRegionIds,
  notificationsDisabled,
  onToggleNotify
}: RegionGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border p-5 h-[240px] flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
            <div className="space-y-2 mt-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <div className="mt-auto pt-4 flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (regions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-xl border border-dashed">
        <h3 className="text-lg font-medium text-foreground">No regions found</h3>
        <p className="text-sm text-muted-foreground mt-1">There are no monitored regions at this time.</p>
      </div>
    );
  }

  // Sort by urgency: Critical > Warning > Watch > Calm
  const urgencyMap = { Critical: 3, Warning: 2, Watch: 1, Calm: 0 };
  const sortedRegions = [...regions].sort((a, b) => urgencyMap[b.status] - urgencyMap[a.status]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sortedRegions.map((region, index) => (
        <RegionCard
          key={region.id}
          region={region}
          index={index}
          isNotified={notifiedRegionIds?.has(region.id) ?? false}
          notificationsDisabled={notificationsDisabled}
          onToggleNotify={onToggleNotify}
        />
      ))}
    </div>
  );
}