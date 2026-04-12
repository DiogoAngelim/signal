import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Region } from "@/types/weather";
import { getStatusConfig } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_SCRIPT_ID = "leaflet-script";
const LEAFLET_STYLE_ID = "leaflet-style";
let leafletPromise: Promise<any> | null = null;

interface RegionMapProps {
  regions: Region[];
  isLoading: boolean;
}

export function RegionMap({ regions, isLoading }: RegionMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);

  const mappableRegions = useMemo(
    () => regions.filter((region) => Number.isFinite(region.latitude) && Number.isFinite(region.longitude)),
    [regions]
  );

  useEffect(() => {
    if (!mapContainerRef.current || isLoading) {
      return;
    }

    let cancelled = false;

    loadLeaflet()
      .then((leaflet) => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        if (!mapRef.current) {
          mapRef.current = leaflet.map(mapContainerRef.current, {
            zoomControl: true,
            scrollWheelZoom: true
          }).setView([20, 0], 2);
          leaflet
            .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
              attribution: "&copy; OpenStreetMap contributors"
            })
            .addTo(mapRef.current);
        }

        refreshMarkers(leaflet, mapRef.current, markersRef, mappableRegions);
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "Failed to load map tiles");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isLoading, mappableRegions]);

  if (isLoading) {
    return (
      <div className="h-[520px] w-full rounded-xl border bg-card p-4">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="h-[520px] w-full rounded-xl border bg-card p-6 flex items-center justify-center text-center">
        <div className="max-w-sm text-sm text-muted-foreground">
          {mapError}
        </div>
      </div>
    );
  }

  if (mappableRegions.length === 0) {
    return (
      <div className="h-[520px] w-full rounded-xl border bg-card p-6 flex items-center justify-center text-center">
        <div className="max-w-sm text-sm text-muted-foreground">
          No regions with coordinates available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="h-[520px] w-full rounded-xl border overflow-hidden relative">
      <div ref={mapContainerRef} className="absolute inset-0" />
    </div>
  );
}

function loadLeaflet(): Promise<any> {
  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = new Promise((resolve, reject) => {
    const styleTag = document.getElementById(LEAFLET_STYLE_ID) as HTMLLinkElement | null;
    if (!styleTag) {
      const link = document.createElement("link");
      link.id = LEAFLET_STYLE_ID;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing && window.L) {
      resolve(window.L);
      return;
    }

    const script = existing ?? document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.defer = true;

    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Failed to load Leaflet"));

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return leafletPromise;
}

function refreshMarkers(
  leaflet: any,
  map: any,
  markersRef: MutableRefObject<any[]>,
  regions: Region[]
) {
  markersRef.current.forEach((marker) => marker.remove());
  markersRef.current = [];

  const bounds = leaflet.latLngBounds([]);

  regions.forEach((region) => {
    const position = [region.latitude, region.longitude];
    bounds.extend(position);

    const config = getStatusConfig(region.status);
    const marker = leaflet.marker(position, {
      title: `${region.name} (${config.label})`,
      icon: leaflet.icon({
        iconUrl: buildPinSvg(config.color),
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -28]
      })
    });

    const content = buildInfoContent(region, config);
    marker.bindTooltip(content, {
      direction: "top",
      offset: [0, -24],
      opacity: 0.95,
      className: "weather-map-tooltip"
    });
    marker.bindPopup(content, { maxWidth: 240, className: "weather-map-popup" });
    marker.addTo(map);
    markersRef.current.push(marker);
  });

  if (regions.length === 1) {
    map.setView([regions[0].latitude, regions[0].longitude], 6, { animate: true });
  } else if (regions.length > 0) {
    map.fitBounds(bounds, { padding: [60, 60] });
  }
}

function buildPinSvg(color: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 2C10.5 2 6 6.5 6 12c0 7.5 10 18 10 18s10-10.5 10-18C26 6.5 21.5 2 16 2z" fill="${color}" />
      <circle cx="16" cy="12" r="4" fill="#ffffff" />
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildInfoContent(region: Region, config: ReturnType<typeof getStatusConfig>): string {
  return `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; max-width: 220px;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${escapeHtml(region.name)}</div>
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">${escapeHtml(region.country)}</div>
      <div style="font-size: 12px; margin-bottom: 4px;">
        Status: <span style="color: ${config.color}; font-weight: 600;">${config.label}</span>
      </div>
      <div style="font-size: 12px; margin-bottom: 6px;">Risk: ${region.riskScore}/100</div>
      <div style="font-size: 12px; color: #374151;">${escapeHtml(region.topConcern)}</div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
