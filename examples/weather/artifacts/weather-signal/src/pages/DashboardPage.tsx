import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRegions, subscribeToUpdates } from "@/lib/api";
import type { Region } from "@/types/weather";
import { useWeatherStore } from "@/store/useWeatherStore";
import { SummaryBar } from "@/components/dashboard/SummaryBar";
import { RegionGrid } from "@/components/dashboard/RegionGrid";
import { RegionMap } from "@/components/dashboard/RegionMap";
import { LiveUpdatesFeed } from "@/components/dashboard/LiveUpdatesFeed";
import { ProviderHealth } from "@/components/dashboard/ProviderHealth";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map as MapIcon, Search } from "lucide-react";

export function DashboardPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "map">("search");
  const { refreshCount, refreshNow } = useWeatherStore();
  const lastRefreshRef = useRef(0);
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) {
      return regions;
    }
    const needle = searchQuery.trim().toLowerCase();
    return regions.filter((region) => {
      return (
        region.name.toLowerCase().includes(needle) ||
        region.country.toLowerCase().includes(needle) ||
        region.id.toLowerCase().includes(needle)
      );
    });
  }, [regions, searchQuery]);
  const summaryRegions = activeTab === "search" ? filteredRegions : regions;

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    fetchRegions().then((data) => {
      if (mounted) {
        setRegions(data);
        setIsLoading(false);
      }
    }).catch(() => {
      if (mounted) setIsLoading(false);
    });

    return () => { mounted = false; };
  }, [refreshCount]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    subscribeToUpdates(() => {
      const now = Date.now();
      if (now - lastRefreshRef.current > 5000) {
        lastRefreshRef.current = now;
        refreshNow();
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [refreshNow]);

  return (
    <div className="flex-1 bg-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        <SummaryBar regions={summaryRegions} />

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "search" | "map")}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="search" className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-2">
                <MapIcon className="h-4 w-4" />
                Map
              </TabsTrigger>
            </TabsList>

            {activeTab === "search" ? (
              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search regions"
                    placeholder="Search regions"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Showing {filteredRegions.length} of {regions.length} regions
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Showing {regions.length} regions on the map
              </div>
            )}
          </div>

          <TabsContent value="search">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <RegionGrid regions={filteredRegions} isLoading={isLoading} />
              </div>

              <div className="lg:col-span-1 flex flex-col gap-4">
                <div className="h-[400px] lg:h-[600px]">
                  <LiveUpdatesFeed />
                </div>
                <ProviderHealth />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="map">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <RegionMap regions={regions} isLoading={isLoading} />
              </div>

              <div className="lg:col-span-1 flex flex-col gap-4">
                <div className="h-[400px] lg:h-[520px]">
                  <LiveUpdatesFeed />
                </div>
                <ProviderHealth />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}