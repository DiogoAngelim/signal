import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { fetchRegion, subscribeToUpdates } from "@/lib/api";
import type { Region, StatusLevel } from "@/types/weather";
import { StatusBadge } from "@/components/region/StatusBadge";
import { SignalBadge } from "@/components/region/SignalBadge";
import { RiskDrivers } from "@/components/region/RiskDrivers";
import { AlertStrip } from "@/components/region/AlertStrip";
import { ForecastChart } from "@/components/region/ForecastChart";
import { EventTimeline } from "@/components/region/EventTimeline";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Bell, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

export function RegionDetailPage() {
  const [, params] = useRoute("/dashboard/region/:id");
  const id = params?.id;

  const [region, setRegion] = useState<Region | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationState, setNotificationState] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const lastStatusRef = useRef<StatusLevel | null>(null);
  const lastNotifiedStatusRef = useRef<StatusLevel | null>(null);
  const isNotificationSupported = useMemo(() => typeof window !== "undefined" && "Notification" in window, []);
  const confidenceLabel = Number.isFinite(region?.signalConfidence)
    ? `${Math.round((region?.signalConfidence ?? 0) * 100)}%`
    : "n/a";

  const notificationKey = id ? `weather-signal-notify:${id}` : null;
  const notificationStatusKey = id ? `weather-signal-notify-status:${id}` : null;
  const isRiskyStatus = (status: StatusLevel) => status === "Watch" || status === "Warning" || status === "Critical";

  const notificationMessage = useMemo(() => {
    if (!isNotificationSupported) {
      return "Browser notifications are not supported on this device.";
    }
    if (notificationState === "denied") {
      return "Notifications are blocked in your browser settings.";
    }
    if (notificationsEnabled) {
      return "You will get alerts when the status becomes Watch or higher.";
    }
    return "Enable alerts when the status becomes Watch or higher.";
  }, [isNotificationSupported, notificationState, notificationsEnabled]);

  useEffect(() => {
    if (!id) return;

    let mounted = true;
    setIsLoading(true);

    fetchRegion(id)
      .then((data) => {
        if (mounted) {
          setRegion(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setRegion(null);
          setIsLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    if (!isNotificationSupported) {
      setNotificationState("unsupported");
      setNotificationsEnabled(false);
      return;
    }

    const permission = Notification.permission;
    setNotificationState(permission);

    const storedEnabled = notificationKey
      ? localStorage.getItem(notificationKey) === "true"
      : false;
    const storedStatus = notificationStatusKey
      ? (localStorage.getItem(notificationStatusKey) as StatusLevel | null)
      : null;

    setNotificationsEnabled(storedEnabled && permission === "granted");
    lastNotifiedStatusRef.current = storedStatus;
    lastStatusRef.current = null;
  }, [id, isNotificationSupported, notificationKey, notificationStatusKey]);

  useEffect(() => {
    if (!id) return;
    let unsubscribe: (() => void) | undefined;
    let lastUpdate = 0;

    subscribeToUpdates((update) => {
      if (update.regionId !== id) return;
      const now = Date.now();
      if (now - lastUpdate < 5000) return;
      lastUpdate = now;
      fetchRegion(id).then((data) => {
        setRegion(data);
      });
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    if (!region) return;
    if (!notificationsEnabled) {
      lastStatusRef.current = region.status;
      return;
    }
    if (!isNotificationSupported) return;
    if (Notification.permission !== "granted") return;

    const previousStatus = lastStatusRef.current;
    lastStatusRef.current = region.status;

    if (!previousStatus) return;
    if (!isRiskyStatus(region.status)) return;
    if (region.status === previousStatus) return;
    if (lastNotifiedStatusRef.current === region.status) return;

    const body = `${region.name} is now ${region.status}. ${region.topConcern}`;
    new Notification(`${region.name} risk update`, {
      body,
      tag: `${region.id}-${region.status}`
    });

    lastNotifiedStatusRef.current = region.status;
    if (notificationStatusKey) {
      localStorage.setItem(notificationStatusKey, region.status);
    }
  }, [region, notificationsEnabled, isNotificationSupported, notificationStatusKey]);

  const handleNotificationToggle = async (checked: boolean) => {
    if (!isNotificationSupported) {
      setNotificationState("unsupported");
      return;
    }

    if (!checked) {
      setNotificationsEnabled(false);
      if (notificationKey) {
        localStorage.setItem(notificationKey, "false");
      }
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setNotificationState("denied");
      return;
    }

    const result = permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    setNotificationState(result as "default" | "granted" | "denied");

    if (result === "granted") {
      setNotificationsEnabled(true);
      if (notificationKey) {
        localStorage.setItem(notificationKey, "true");
      }
      return;
    }

    setNotificationsEnabled(false);
    if (notificationKey) {
      localStorage.setItem(notificationKey, "false");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">
        <Skeleton className="h-10 w-32" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!region) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-semibold mb-4">Region not found</h2>
        <Link href="/dashboard">
          <Button variant="outline">Return to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const getActionLevel = (status: string) => {
    switch (status) {
      case "Critical": return "Immediate action required. Execute emergency protocols.";
      case "Warning": return "Review safety protocols. Prepare for potential disruption.";
      case "Watch": return "Monitor situation closely. No immediate action needed.";
      case "Calm": return "Normal operations recommended.";
      default: return "Monitor for updates.";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="container mx-auto px-4 py-8 max-w-5xl"
    >
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-6 -ml-3 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <MapPin className="h-4 w-4" />
            <span>{region.country} {region.countryFlag}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
            {region.name}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {region.summary}
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
          <StatusBadge status={region.status} size="lg" className="text-lg px-6 py-2" />
          <div className="text-sm font-medium text-foreground bg-muted/50 px-4 py-2 rounded-lg border w-full md:w-auto text-center">
            {getActionLevel(region.status)}
          </div>
          {region.signalAction && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border">
              <SignalBadge action={region.signalAction} size="sm" />
              <span>Confidence {confidenceLabel}</span>
            </div>
          )}
        </div>
      </div>

      {region.alerts.length > 0 && (
        <div className="mb-10">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Active Alerts</h2>
          <AlertStrip alerts={region.alerts} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Decision Signal</h2>
            <div className="flex flex-wrap items-center gap-3">
              {region.signalAction && <SignalBadge action={region.signalAction} size="lg" />}
              <span className="text-sm text-muted-foreground">Confidence {confidenceLabel}</span>
              <span className="text-xs text-muted-foreground">Source: {region.signalSource ?? "heuristic"}</span>
            </div>
            {region.signalReasons?.length ? (
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground list-disc list-inside">
                {region.signalReasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Signals are inferred from forecast and risk scoring when no policy decision is available.
              </p>
            )}
          </section>

          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Risk Drivers</h2>
            <RiskDrivers drivers={region.riskDrivers} />
          </section>

          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Forecast Snapshot</h2>
              <span className="text-sm text-muted-foreground">Next 24 hours</span>
            </div>
            <ForecastChart points={region.forecastPoints} />
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-card rounded-xl border p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-foreground mb-2">
                  <Bell className="h-4 w-4" />
                  <h2 className="text-lg font-semibold">Notifications</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {notificationMessage}
                </p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleNotificationToggle}
                disabled={!isNotificationSupported || notificationState === "denied"}
                aria-label="Enable risk notifications for this city"
              />
            </div>
          </section>

          <section className="bg-card rounded-xl border p-6 shadow-sm h-full">
            <h2 className="text-lg font-semibold mb-6 text-foreground">Recent Events</h2>
            <EventTimeline events={region.recentEvents} />
          </section>
        </div>
      </div>
    </motion.div>
  );
}