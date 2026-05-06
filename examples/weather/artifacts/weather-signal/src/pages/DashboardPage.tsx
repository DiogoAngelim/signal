import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRegion, fetchRegions, subscribeToUpdates } from "@/lib/api";
import type { Region, SignalAction } from "@/types/weather";
import { useWeatherStore } from "@/store/useWeatherStore";
import { SummaryBar } from "@/components/dashboard/SummaryBar";
import { RegionGrid } from "@/components/dashboard/RegionGrid";
import { RegionMap } from "@/components/dashboard/RegionMap";
import { LiveUpdatesFeed } from "@/components/dashboard/LiveUpdatesFeed";
import { ProviderHealth } from "@/components/dashboard/ProviderHealth";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Map as MapIcon, Search } from "lucide-react";
import { AUTO_REFRESH_INTERVAL_MS } from "@/lib/refresh";

const MAX_VISIBLE_REGIONS = 120;

export function DashboardPage() {
  const isNotificationSupported = useMemo(
    () => typeof window !== "undefined" && "Notification" in window,
    []
  );
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "map">("search");
  const [signalFilter, setSignalFilter] = useState<SignalAction | "All">("All");
  const [notifiedRegionIds, setNotifiedRegionIds] = useState<string[]>([]);
  const [notificationState, setNotificationState] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const { refreshCount, refreshNow } = useWeatherStore();
  const lastRefreshRef = useRef(0);
  const notifyRegionIdsRef = useRef(new Set<string>());
  const lastSignalRef = useRef(new Map<string, SignalAction>());
  const lastNotifyRef = useRef(new Map<string, number>());
  const signalOptions: Array<SignalAction | "All"> = [
    "All",
    "Escalate",
    "Warn",
    "Watch",
    "Dispatch",
    "Review",
    "Cancel",
    "Suppress Duplicate",
    "No Action"
  ];
  const notifiedRegionSet = useMemo(
    () => new Set(notifiedRegionIds),
    [notifiedRegionIds]
  );
  const filteredRegions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return regions.filter((region) => {
      const matchesSearch = !needle
        ? true
        : region.name.toLowerCase().includes(needle) ||
        (region.state?.toLowerCase().includes(needle) ?? false) ||
        region.country.toLowerCase().includes(needle) ||
        region.id.toLowerCase().includes(needle);
      const action = region.signalAction ?? "No Action";
      const matchesSignal = signalFilter === "All" ? true : action === signalFilter;
      return matchesSearch && matchesSignal;
    });
  }, [regions, searchQuery, signalFilter]);
  const visibleRegions = useMemo(
    () => filteredRegions.slice(0, MAX_VISIBLE_REGIONS),
    [filteredRegions]
  );
  const summaryRegions = activeTab === "search" ? filteredRegions : regions;
  const notificationsDisabled = notificationState === "unsupported" || notificationState === "denied";

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
    if (!isNotificationSupported) {
      setNotificationState("unsupported");
      return;
    }
    setNotificationState(Notification.permission as "default" | "granted" | "denied");
  }, [isNotificationSupported]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("weather-signal-notify:regions");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setNotifiedRegionIds(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    notifyRegionIdsRef.current = new Set(notifiedRegionIds);
    if (typeof window === "undefined") return;
    localStorage.setItem("weather-signal-notify:regions", JSON.stringify(notifiedRegionIds));
  }, [notifiedRegionIds]);

  useEffect(() => {
    regions.forEach((region) => {
      if (!lastSignalRef.current.has(region.id)) {
        lastSignalRef.current.set(region.id, region.signalAction ?? "No Action");
      }
    });
  }, [regions]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const handleSignalNotification = async (regionId: string) => {
      if (!notifyRegionIdsRef.current.has(regionId)) return;
      if (!isNotificationSupported) return;
      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const lastNotified = lastNotifyRef.current.get(regionId) ?? 0;
      if (now - lastNotified < 10000) return;

      const region = await fetchRegion(regionId);
      if (!region) return;

      const nextAction = region.signalAction ?? "No Action";
      const previousAction = lastSignalRef.current.get(regionId);
      lastSignalRef.current.set(regionId, nextAction);
      if (!previousAction || previousAction === nextAction) return;

      const confidenceLabel = Number.isFinite(region.signalConfidence)
        ? `${Math.round((region.signalConfidence ?? 0) * 100)}%`
        : "n/a";
      const body = `Signal: ${nextAction} (${confidenceLabel}). ${region.topConcern}`;
      new Notification(`${region.name} signal update`, {
        body,
        tag: `${region.id}-${nextAction}`
      });

      lastNotifyRef.current.set(regionId, now);
    };

    subscribeToUpdates((update) => {
      const now = Date.now();
      if (now - lastRefreshRef.current > AUTO_REFRESH_INTERVAL_MS) {
        lastRefreshRef.current = now;
        refreshNow();
      }

      if (update.regionId) {
        void handleSignalNotification(update.regionId);
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [refreshNow, isNotificationSupported]);

  const ensureNotificationPermission = async () => {
    if (!isNotificationSupported) {
      setNotificationState("unsupported");
      return false;
    }

    if (Notification.permission === "granted") {
      setNotificationState("granted");
      return true;
    }

    if (Notification.permission === "denied") {
      setNotificationState("denied");
      return false;
    }

    const permission = await Notification.requestPermission();
    setNotificationState(permission as "default" | "granted" | "denied");
    return permission === "granted";
  };

  const handleToggleNotify = async (regionId: string) => {
    if (notifiedRegionSet.has(regionId)) {
      setNotifiedRegionIds((prev) => prev.filter((id) => id !== regionId));
      return;
    }

    const allowed = await ensureNotificationPermission();
    if (!allowed) return;

    setNotifiedRegionIds((prev) => {
      if (prev.includes(regionId)) return prev;
      return [...prev, regionId];
    });

    const region = regions.find((item) => item.id === regionId);
    if (region) {
      lastSignalRef.current.set(regionId, region.signalAction ?? "No Action");
    }
  };

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
              <div className="flex flex-col gap-2 w-full md:w-auto">
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
                  <Select
                    value={signalFilter}
                    onValueChange={(value) => setSignalFilter(value as SignalAction | "All")}
                  >
                    <SelectTrigger className="w-full md:w-48">
                      <SelectValue placeholder="Signal" />
                    </SelectTrigger>
                    <SelectContent>
                      {signalOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Showing {Math.min(visibleRegions.length, filteredRegions.length)} of {filteredRegions.length} matching regions, {regions.length} total
                  </div>
                </div>
                {filteredRegions.length > MAX_VISIBLE_REGIONS && (
                  <div className="text-xs text-muted-foreground">
                    Refine search or signal filters to narrow results beyond the first {MAX_VISIBLE_REGIONS} municipalities.
                  </div>
                )}
                {notificationState === "denied" && (
                  <div className="text-xs text-destructive">
                    Notifications are blocked in your browser settings.
                  </div>
                )}
                {notificationState === "unsupported" && (
                  <div className="text-xs text-muted-foreground">
                    Browser notifications are not supported on this device.
                  </div>
                )}
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
                <RegionGrid
                  regions={visibleRegions}
                  isLoading={isLoading}
                  notifiedRegionIds={notifiedRegionSet}
                  notificationsDisabled={notificationsDisabled}
                  onToggleNotify={handleToggleNotify}
                />
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
