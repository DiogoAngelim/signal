import {
  Info,
  LocateFixed,
  MapPinned,
  Minus,
  Plus,
  RefreshCw,
  Search
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createBrowserEmergencyAwarenessClient } from "../core/browser-client";
import type {
  ConcernState,
  MapLayerResult,
  PlaceSearchResult,
  ResolvedPlace,
  RiskZone
} from "../core/types";

type WatchResult = {
  place: ResolvedPlace;
  layer: MapLayerResult;
};

const client = createBrowserEmergencyAwarenessClient();

const LEGEND_ITEMS: ConcernState[] = ["No clear concern", "Pay attention", "Prepare", "Act carefully", "Unknown"];

export function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<PlaceSearchResult | undefined>();
  const [watch, setWatch] = useState<WatchResult | undefined>();
  const [, setActiveZoneId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setMessage(undefined);
    try {
      const found = await client.searchPlaces(query);
      setResults(found);
      if (!found.length) setMessage("No place found. Try a city, neighborhood, region, or address.");
    } catch {
      setMessage("Place search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function watchPlace(place: PlaceSearchResult, refresh = false) {
    setSelected(place);
    if (!refresh) {
      setQuery("");
      setResults([]);
    }
    setLoading(true);
    setMessage(undefined);
    try {
      const next = refresh ? await client.refreshPlace(place) : await client.watchPlace(place);
      setWatch(next);
      setActiveZoneId(primaryZone(next.evaluation.zones)?.id);
    } catch {
      setMessage("Information is missing. The map will update when providers respond.");
    } finally {
      setLoading(false);
    }
  }

  if (!watch) {
    return (
      <main className="entry-shell">
        <section className="entry-map" aria-hidden="true">
          <div className="entry-grid" />
          <div className="entry-area entry-area-one" />
          <div className="entry-area entry-area-two" />
          <div className="entry-area entry-area-three" />
        </section>
        <section className="entry-panel" aria-label="Choose place">
          <p className="brand">Signal Emergency Awareness</p>
          <h1>Where should we watch?</h1>
          <form className="search-row" onSubmit={runSearch}>
            <Search aria-hidden="true" size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for a city, neighborhood, region, or address."
              aria-label="Search for a city, neighborhood, region, or address."
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? <RefreshCw aria-hidden="true" size={18} className="spin" /> : <Search aria-hidden="true" size={18} />}
              <span>Search</span>
            </button>
          </form>
          {message ? <p className="notice"><Info size={16} aria-hidden="true" />{message}</p> : null}
          <div className="results-list" aria-label="Place results">
            {results.map((result) => (
              <button key={result.id} type="button" onClick={() => void watchPlace(result)}>
                <MapPinned size={18} aria-hidden="true" />
                <span>
                  <strong>{shortLabel(result.label)}</strong>
                  <small>{result.region ?? result.provider}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <form className="compact-search" onSubmit={runSearch}>
          <Search aria-hidden="true" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search place"
            aria-label="Search place"
          />
          <button type="submit" disabled={loading || !query.trim()} aria-label="Search place" title="Search place">
            {loading ? <RefreshCw aria-hidden="true" size={17} className="spin" /> : <Search aria-hidden="true" size={17} />}
          </button>
        </form>
        <div className="place-title">
          <strong>{shortLabel(watch.place.label)}</strong>
          <span>{watch.place.precisionLabel}</span>
        </div>
        <button className="icon-button" type="button" onClick={() => selected && void watchPlace(selected, true)} aria-label="Refresh">
          <RefreshCw size={18} aria-hidden="true" className={loading ? "spin" : undefined} />
        </button>
      </header>

      {results.length && query ? (
        <div className="floating-results" aria-label="Place results">
          {results.map((result) => (
            <button key={result.id} type="button" onClick={() => void watchPlace(result)}>
              {shortLabel(result.label)}
            </button>
          ))}
        </div>
      ) : null}

      <section className="map-stage">
        <RiskMap
          key={`${watch.place.provider}:${watch.place.id}`}
          place={watch.place}
          layer={watch.layer}
          onSelectZone={setActiveZoneId}
        />
        <Legend />
      </section>

      {message ? <p className="toast"><Info size={16} aria-hidden="true" />{message}</p> : null}
    </main>
  );
}

function RiskMap(props: {
  place: ResolvedPlace;
  layer: MapLayerResult;
  onSelectZone(zoneId: string): void;
}) {
  const center = props.place.coordinates;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 960, height: 640 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const model = mapModelFor(center.latitude, center.longitude, 11, view, mapSize);
  const tiles = tileUrlsForViewport(model, view.scale);
  const heatPoints = continuousHeatPoints(props.layer.features, model, view.scale);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setMapSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(260, Math.round(rect.height))
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function zoomBy(delta: number) {
    setView((current) => ({ ...current, scale: clamp(current.scale + delta, 0.82, 2.65) }));
  }

  function resetView() {
    setView({ x: 0, y: 0, scale: 1 });
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.12 : 0.12);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      moved: false
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    setView((current) => ({
      ...current,
      x: drag.originX + dx,
      y: drag.originY + dy
    }));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      window.setTimeout(() => {
        dragRef.current = null;
      }, 0);
    }
  }

  function selectZone(zoneId: string) {
    if (dragRef.current?.moved) return;
    props.onSelectZone(zoneId);
  }

  function stopMapGesture(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    event.stopPropagation();
  }

  return (
    <div
      ref={mapRef}
      className="risk-map"
      role="img"
      aria-label={`Concern map for ${props.place.label}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="map-transform">
        <div className="tile-grid" aria-hidden="true">
          {tiles.map((tile) => (
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`
              }}
            />
          ))}
        </div>
        <svg className="risk-overlay" viewBox={`0 0 ${mapSize.width} ${mapSize.height}`} preserveAspectRatio="none">
          <defs>
            <filter id="heat-soften" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="3.2" />
              <feColorMatrix type="saturate" values="1.25" />
            </filter>
            <pattern id="pattern-watch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" />
            </pattern>
            <pattern id="pattern-prepare" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0 5 L5 0" />
            </pattern>
            <pattern id="pattern-careful" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0 0 L5 5 M5 0 L0 5" />
            </pattern>
            <pattern id="pattern-unknown" width="7" height="7" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" />
            </pattern>
          </defs>
          <g className="heat-field" filter="url(#heat-soften)">
            {heatPoints.map((point) => (
              <circle
                key={point.id}
                className={`heat heat-${stateClass(point.state)}`}
                cx={point.x}
                cy={point.y}
                r={point.radius}
                style={{ "--heat-opacity": heatOpacity(point.score, point.weight) } as CSSProperties}
              />
            ))}
          </g>
          <g className="texture-field" aria-hidden="true">
            {props.layer.features.map((feature) => {
              const points = pointsFor(feature.geometry.coordinates[0], model, view.scale);
              return (
                <polygon
                  key={`${feature.id}:texture`}
                  className={`texture texture-${stateClass(feature.properties.riskState)}`}
                  points={points}
                />
              );
            })}
          </g>
          <g className="evaluated-area-field" aria-hidden="true">
            {props.layer.features.map((feature) => {
              const points = pointsFor(feature.geometry.coordinates[0], model, view.scale);
              return (
                <polygon
                  key={`${feature.id}:evaluated`}
                  className="evaluated-area"
                  points={points}
                />
              );
            })}
          </g>
          <g className="map-labels" aria-hidden="true">
            {props.layer.features.map((feature) => {
              const points = pointsFor(feature.geometry.coordinates[0], model, view.scale);
              return (
                <text key={`${feature.id}:label`} x={labelPoint(points, 0)} y={labelPoint(points, 1)}>
                  {shortState(feature.properties.riskState)}
                </text>
              );
            })}
          </g>
          <g className="hit-field">
            {props.layer.features.map((feature) => {
              const points = pointsFor(feature.geometry.coordinates[0], model, view.scale);
              return (
                <polygon
                  key={`${feature.id}:hit`}
                  points={points}
                  tabIndex={0}
                  role="button"
                  aria-label={`${feature.properties.label}: ${feature.properties.riskState}`}
                  onClick={() => selectZone(feature.id)}
                  onKeyDown={(event) => event.key === "Enter" && props.onSelectZone(feature.id)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="map-controls" aria-label="Map controls" onPointerDown={stopMapGesture}>
        <button type="button" onClick={() => zoomBy(0.18)} aria-label="Zoom in" title="Zoom in">
          <Plus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => zoomBy(-0.18)} aria-label="Zoom out" title="Zoom out">
          <Minus size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={resetView} aria-label="Reset map" title="Reset map">
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Risk legend">
      {LEGEND_ITEMS.map((state) => (
        <span key={state} className={`legend-item state-${stateClass(state)}`}>
          <i aria-hidden="true" />
          {state}
        </span>
      ))}
    </div>
  );
}

function primaryZone(zones: RiskZone[] | undefined): RiskZone | undefined {
  return zones ? [...zones].sort((left, right) => right.riskScore - left.riskScore)[0] : undefined;
}

function shortLabel(label: string): string {
  return label.split(",").slice(0, 3).join(", ");
}

function stateClass(state: ConcernState): string {
  if (state === "No clear concern") return "clear";
  if (state === "Pay attention") return "watch";
  if (state === "Prepare") return "prepare";
  if (state === "Act carefully") return "careful";
  return "unknown";
}

function shortState(state: ConcernState): string {
  if (state === "No clear concern") return "Clear";
  if (state === "Pay attention") return "Watch";
  if (state === "Prepare") return "Prepare";
  if (state === "Act carefully") return "Careful";
  return "Unknown";
}

function heatOpacity(score: number, weight = 1): string {
  return String(clamp((0.18 + score / 116) * weight, 0.14, 0.9));
}

function pointsFor(ring: number[][] | undefined, model: MapModel, scale: number): string {
  return projectedRing(ring, model, scale)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function continuousHeatPoints(features: MapLayerResult["features"], model: MapModel, scale: number) {
  const anchors = features.map((feature) => {
    const worldCenter = centroidWorld(feature.geometry.coordinates[0], model.zoom);
    const screenCenter = worldToScreen(worldCenter, model, scale);
    return {
      id: feature.id,
      x: screenCenter.x,
      y: screenCenter.y,
      worldX: worldCenter.x,
      worldY: worldCenter.y,
      score: feature.properties.riskScore,
      state: feature.properties.riskState
    };
  });
  if (!anchors.length) return [];

  const points: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
    score: number;
    state: ConcernState;
    weight: number;
  }> = [];

  const stepWorld = 96;
  const paddingWorld = stepWorld * 2.5;
  const topLeft = screenToWorld(0, 0, model, scale);
  const bottomRight = screenToWorld(model.width, model.height, model, scale);
  const startWorldX = Math.floor((topLeft.x - paddingWorld) / stepWorld) * stepWorld;
  const endWorldX = Math.ceil((bottomRight.x + paddingWorld) / stepWorld) * stepWorld;
  const startWorldY = Math.floor((topLeft.y - paddingWorld) / stepWorld) * stepWorld;
  const endWorldY = Math.ceil((bottomRight.y + paddingWorld) / stepWorld) * stepWorld;

  for (let worldX = startWorldX; worldX <= endWorldX; worldX += stepWorld) {
    for (let worldY = startWorldY; worldY <= endWorldY; worldY += stepWorld) {
      const screen = worldToScreen({ x: worldX, y: worldY }, model, scale);
      const blended = blendedHeat({ x: worldX, y: worldY }, anchors, model, scale);
      const edgeDistance = Math.max(0, -screen.x, screen.x - model.width, -screen.y, screen.y - model.height);
      points.push({
        id: `ambient:${Math.round(worldX)}:${Math.round(worldY)}`,
        x: screen.x,
        y: screen.y,
        radius: (stepWorld * 0.78 + blended.score / 4) * scale,
        score: blended.score,
        state: heatState(blended.score, blended.nearest.state),
        weight: clamp(0.55 - edgeDistance / Math.max(model.width, model.height), 0.32, 0.58)
      });
    }
  }

  for (const anchor of anchors) {
    points.push({
      id: `anchor:${anchor.id}`,
      x: anchor.x,
      y: anchor.y,
      radius: (stepWorld * 0.62 + anchor.score / 4) * scale,
      score: anchor.score,
      state: anchor.state,
      weight: 0.96
    });
  }

  return points;
}

function blendedHeat(
  world: { x: number; y: number },
  anchors: Array<{ x: number; y: number; worldX: number; worldY: number; score: number; state: ConcernState }>,
  model: MapModel,
  scale: number,
) {
  let weightedScore = 0;
  let totalWeight = 0;
  let nearest = anchors[0] ?? { x: model.width / 2, y: model.height / 2, worldX: world.x, worldY: world.y, score: 0, state: "Unknown" as ConcernState };
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const worldDistance = Math.hypot(anchor.worldX - world.x, anchor.worldY - world.y);
    const distance = worldDistance * 1.05;
    if (distance < nearestDistance) {
      nearest = anchor;
      nearestDistance = distance;
    }
    const weight = 1 / (18 + distance ** 1.35);
    weightedScore += anchor.score * weight;
    totalWeight += weight;
  }
  const localScore = totalWeight > 0 ? weightedScore / totalWeight : nearest.score;
  const ambient = ambientHeatScore(world, nearest.score);
  const viewportWorldSpan = Math.max(model.width, model.height) / scale;
  const influence = clamp(1 - nearestDistance / Math.max(viewportWorldSpan, 1), 0, 1);
  return {
    score: localScore * influence + ambient * (1 - influence),
    nearest
  };
}

function heatState(score: number, fallback: ConcernState): ConcernState {
  if (fallback === "Unknown") return "Unknown";
  if (score >= 75) return "Act carefully";
  if (score >= 50) return "Prepare";
  if (score >= 25) return "Pay attention";
  return "No clear concern";
}

function projectedRing(ring: number[][] | undefined, model: MapModel, scale: number): Array<{ x: number; y: number }> {
  return (ring ?? []).map((pair) => {
    const longitude = pair[0] ?? 0;
    const latitude = pair[1] ?? 0;
    return worldToScreen(worldPixelFromLonLat(latitude, longitude, model.zoom), model, scale);
  });
}

function centroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function centroidWorld(ring: number[][] | undefined, zoom: number): { x: number; y: number } {
  const points = (ring ?? []).map((pair) => worldPixelFromLonLat(pair[1] ?? 0, pair[0] ?? 0, zoom));
  return centroid(points);
}

type MapModel = {
  width: number;
  height: number;
  zoom: number;
  centerWorld: { x: number; y: number };
};

function mapModelFor(
  latitude: number,
  longitude: number,
  zoom: number,
  view: { x: number; y: number; scale: number },
  size: { width: number; height: number },
): MapModel {
  const base = worldPixelFromLonLat(latitude, longitude, zoom);
  return {
    width: size.width,
    height: size.height,
    zoom,
    centerWorld: {
      x: base.x - view.x / view.scale,
      y: base.y - view.y / view.scale
    }
  };
}

function tileUrlsForViewport(model: MapModel, scale: number) {
  const tileSize = 256;
  const scaledTileSize = tileSize * scale;
  const buffer = tileSize * 2;
  const minWorldX = model.centerWorld.x - (model.width / 2 + buffer) / scale;
  const maxWorldX = model.centerWorld.x + (model.width / 2 + buffer) / scale;
  const minWorldY = model.centerWorld.y - (model.height / 2 + buffer) / scale;
  const maxWorldY = model.centerWorld.y + (model.height / 2 + buffer) / scale;
  const minTileX = Math.floor(minWorldX / tileSize);
  const maxTileX = Math.ceil(maxWorldX / tileSize);
  const minTileY = Math.floor(minWorldY / tileSize);
  const maxTileY = Math.ceil(maxWorldY / tileSize);
  const maxTile = 2 ** model.zoom;
  const tiles: Array<{ url: string; left: number; top: number; size: number }> = [];

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= maxTile) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedTileX = modulo(tileX, maxTile);
      const screen = worldToScreen({ x: tileX * tileSize, y: tileY * tileSize }, model, scale);
      tiles.push({
        url: `https://tile.openstreetmap.org/${model.zoom}/${wrappedTileX}/${tileY}.png`,
        left: screen.x,
        top: screen.y,
        size: scaledTileSize
      });
    }
  }
  return tiles;
}

function worldPixelFromLonLat(latitude: number, longitude: number, zoom: number): { x: number; y: number } {
  const scale = 2 ** zoom;
  const tileSize = 256;
  const clippedLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const latRad = clippedLatitude * Math.PI / 180;
  return {
    x: ((longitude + 180) / 360) * scale * tileSize,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale * tileSize
  };
}

function worldToScreen(world: { x: number; y: number }, model: MapModel, scale: number): { x: number; y: number } {
  return {
    x: model.width / 2 + (world.x - model.centerWorld.x) * scale,
    y: model.height / 2 + (world.y - model.centerWorld.y) * scale
  };
}

function screenToWorld(x: number, y: number, model: MapModel, scale: number): { x: number; y: number } {
  return {
    x: model.centerWorld.x + (x - model.width / 2) / scale,
    y: model.centerWorld.y + (y - model.height / 2) / scale
  };
}

function ambientHeatScore(world: { x: number; y: number }, baseline: number): number {
  const wave =
    Math.sin(world.x * 0.012 + world.y * 0.007) * 8 +
    Math.sin(world.x * 0.004 - world.y * 0.013) * 5;
  return clamp(baseline * 0.58 + 20 + wave, 8, baseline >= 75 ? 82 : 68);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function labelPoint(points: string | undefined, axis: 0 | 1): number {
  if (!points) return 50;
  const parsed = points.split(" ").map((point) => Number(point.split(",")[axis])).filter(Number.isFinite);
  if (!parsed.length) return 50;
  return parsed.reduce((sum, value) => sum + value, 0) / parsed.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
