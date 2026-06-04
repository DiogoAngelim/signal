import {
  Anchor,
  LocateFixed,
  Minus,
  Plus,
  Ship,
  Waves
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Coordinate, MaritimeBriefing } from "../contracts.js";
import { projectToMap } from "../map/vessels.js";

export type MaritimeMapProps = {
  briefing: MaritimeBriefing;
  onCreateArea?: (center: Coordinate) => void;
};

type ViewState = {
  x: number;
  y: number;
  zoom: number;
};

export function MaritimeMap({ briefing, onCreateArea }: MaritimeMapProps) {
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 1 });
  const [dragStart, setDragStart] = useState<{ clientX: number; clientY: number; x: number; y: number } | undefined>();
  const vesselPoints = useMemo(
    () => briefing.vessels.map((vessel) => ({ vessel, point: projectToMap(vessel.projected, briefing.area.bounds) })),
    [briefing]
  );
  const clusterPoints = useMemo(
    () => briefing.clusters.map((cluster) => ({ cluster, point: projectToMap(cluster.center, briefing.area.bounds) })),
    [briefing]
  );

  function zoomBy(delta: number) {
    setView((current) => ({
      ...current,
      zoom: clamp(Number((current.zoom + delta).toFixed(2)), 0.8, 2.4)
    }));
  }

  function resetView() {
    setView({ x: 0, y: 0, zoom: 1 });
  }

  function startDrag(event: React.PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y });
  }

  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragStart) return;
    setView((current) => ({
      ...current,
      x: clamp(dragStart.x + (event.clientX - dragStart.clientX) / 2, -28, 28),
      y: clamp(dragStart.y + (event.clientY - dragStart.clientY) / 2, -22, 22)
    }));
  }

  function finishDrag(event: React.PointerEvent<SVGSVGElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragStart(undefined);
  }

  function selectPoint(event: React.MouseEvent<SVGSVGElement>) {
    if (!onCreateArea) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    const longitude = briefing.area.bounds.west + (x / 100) * (briefing.area.bounds.east - briefing.area.bounds.west);
    const latitude = briefing.area.bounds.north - (y / 100) * (briefing.area.bounds.north - briefing.area.bounds.south);
    onCreateArea({ latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)) });
  }

  return (
    <section className="map-shell" aria-labelledby="map-title">
      <div className="map-heading">
        <div>
          <p className="section-kicker">Live Context Map</p>
          <h2 id="map-title">{briefing.area.name}</h2>
        </div>
        <div className="map-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => zoomBy(0.2)} aria-label="Zoom in" title="Zoom in">
            <Plus size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomBy(-0.2)} aria-label="Zoom out" title="Zoom out">
            <Minus size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={resetView} aria-label="Reset map" title="Reset map">
            <LocateFixed size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <svg
        className="maritime-map"
        viewBox="0 0 100 72"
        role="img"
        aria-label={`Context map for ${briefing.area.name}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={() => setDragStart(undefined)}
        onDoubleClick={selectPoint}
      >
        <defs>
          <linearGradient id="seaGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#d8f3f0" />
            <stop offset="56%" stopColor="#99d7df" />
            <stop offset="100%" stopColor="#4f96ac" />
          </linearGradient>
          <pattern id="mapTexture" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 0 8 C 3 5, 7 11, 12 7" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.45" />
          </pattern>
        </defs>
        <rect width="100" height="72" rx="4" fill="url(#seaGradient)" />
        <rect width="100" height="72" rx="4" fill="url(#mapTexture)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`} style={{ transformOrigin: "50px 36px" }}>
          <path className="coastline-shape" d="M 0 52 C 10 47, 17 56, 28 50 C 38 44, 45 49, 57 43 C 70 36, 82 38, 100 28 L 100 72 L 0 72 Z" />
          <path className="shipping-lane" d="M 8 20 C 25 29, 39 31, 57 29 C 72 27, 84 23, 94 16" />
          <path className="shipping-lane secondary" d="M 11 47 C 28 41, 43 38, 55 37 C 73 36, 87 42, 96 55" />
          <g className="map-pin-area" transform="translate(50 36)">
            <circle r="5.2" />
            <Anchor size={9} x="-4.5" y="-4.5" aria-hidden="true" />
          </g>
          {clusterPoints.map(({ cluster, point }) => (
            <g className={`vessel-cluster freshness-${cluster.freshness}`} key={cluster.id} transform={`translate(${point.x} ${point.y})`}>
              <circle r={Math.min(7.5, 3.8 + cluster.count * 0.28)} />
              <text textAnchor="middle" dominantBaseline="central">{cluster.count}</text>
            </g>
          ))}
          {vesselPoints.map(({ vessel, point }, index) => (
            <g
              className={`vessel-marker freshness-${vessel.freshness}`}
              key={vessel.id}
              transform={`translate(${point.x} ${point.y}) rotate(${vessel.heading})`}
              style={{ transitionDelay: `${index * 35}ms` }}
            >
              <path d="M 0 -2.9 L 2.1 2.5 L 0 1.6 L -2.1 2.5 Z" />
            </g>
          ))}
        </g>
      </svg>
      <div className="map-caption">
        <span><Ship size={15} aria-hidden="true" />{briefing.vesselSummary}</span>
        <span><Waves size={15} aria-hidden="true" />{briefing.area.label}</span>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
