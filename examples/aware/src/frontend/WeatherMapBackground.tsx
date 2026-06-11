import { LocateFixed, Minus, Plus } from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Briefing, Region, WeatherSignal } from "../contracts.js";

type ConcernState =
  | "No clear concern"
  | "Pay attention"
  | "Prepare"
  | "Act carefully"
  | "Unknown";

type WeatherMapFeature = {
  id: string;
  geometry: {
    coordinates: number[][][];
  };
  properties: {
    label: string;
    riskState: ConcernState;
    riskScore: number;
  };
};

type WeatherMapLayer = {
  features: WeatherMapFeature[];
};

type WeatherMapBackgroundProps = {
  briefing?: Briefing;
  variant?: "home" | "briefing";
};

const SIGNAL_ORDER: WeatherSignal["signal"][] = [
  "weather.heat",
  "weather.heavy_rain",
  "weather.uv",
];

const DEFAULT_REGION: Region = {
  id: "aware-weather-background",
  name: "Aware",
  adminArea: "Regional view",
  country: "United States",
  latitude: 39.8283,
  longitude: -98.5795,
  timezone: "America/New_York",
  searchTerms: ["aware", "weather"],
  defaultFixtureId: "normal-day",
};

const DEFAULT_SIGNALS: WeatherSignal[] = SIGNAL_ORDER.map((signal) => ({
  id: `aware-background-${signal.replace("weather.", "")}`,
  signal,
  label: labelForSignal(signal),
  attentionLevel: "normal",
  attentionLabel: "Normal",
  severity: 0,
  meaning: "No elevated weather signal is selected yet.",
  updatedAt: new Date(0).toISOString(),
  sourceIds: [],
}));

export function WeatherMapBackground({
  briefing,
  variant = "briefing",
}: WeatherMapBackgroundProps) {
  const region = briefing?.region ?? DEFAULT_REGION;
  const signals = briefing?.weatherSignals.length
    ? briefing.weatherSignals
    : DEFAULT_SIGNALS;
  const localized = Boolean(briefing);
  const layer = useMemo(
    () => weatherLayerFor(region, signals, localized),
    [localized, region.id, region.latitude, region.longitude, signals],
  );

  return (
    <div
      className={`weather-map-backdrop weather-map-${variant}`}
      aria-label="Weather awareness map"
    >
      <AwareRiskMap
        key={`${localized ? "region" : "ambient"}:${region.id}`}
        region={region}
        layer={layer}
        zoom={localized ? 11 : 5}
      />
    </div>
  );
}

function AwareRiskMap(props: {
  region: Region;
  layer: WeatherMapLayer;
  zoom: number;
}) {
  const center = {
    latitude: props.region.latitude,
    longitude: props.region.longitude,
  };
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapSize, setMapSize] = useState({ width: 960, height: 640 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const model = mapModelFor(
    center.latitude,
    center.longitude,
    props.zoom,
    view,
    mapSize,
  );
  const tiles = tileUrlsForViewport(model, view.scale);
  const heatPoints = continuousHeatPoints(
    props.layer.features,
    model,
    view.scale,
  );

  useEffect(() => {
    const node = mapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setMapSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(260, Math.round(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function zoomBy(delta: number) {
    setView((current) => ({
      ...current,
      scale: clamp(current.scale + delta, 0.82, 2.65),
    }));
  }

  function resetView() {
    setView({ x: 0, y: 0, scale: 1 });
  }

  return (
    <div
      ref={mapRef}
      className="aware-risk-map"
      role="img"
      aria-label={`Weather signal heat map for ${props.region.name}`}
    >
      <div className="aware-map-transform">
        <div className="aware-tile-grid">
          {tiles.map((tile) => (
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
              }}
            />
          ))}
        </div>
        <svg
          className="aware-risk-overlay"
          viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <filter
              id="aware-heat-soften"
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
            >
              <feGaussianBlur stdDeviation="3.2" />
              <feColorMatrix type="saturate" values="1.25" />
            </filter>
            <pattern
              id="aware-pattern-watch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" />
            </pattern>
            <pattern
              id="aware-pattern-prepare"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0 5 L5 0" />
            </pattern>
            <pattern
              id="aware-pattern-careful"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0 0 L5 5 M5 0 L0 5" />
            </pattern>
          </defs>
          <g className="aware-heat-field" filter="url(#aware-heat-soften)">
            {heatPoints.map((point) => (
              <circle
                key={point.id}
                className={`aware-heat aware-heat-${stateClass(point.state)}`}
                cx={point.x}
                cy={point.y}
                r={point.radius}
                style={
                  {
                    "--heat-opacity": heatOpacity(point.score, point.weight),
                  } as CSSProperties
                }
              />
            ))}
          </g>
          <g className="aware-texture-field">
            {props.layer.features.map((feature) => {
              const points = pointsFor(
                feature.geometry.coordinates[0],
                model,
                view.scale,
              );
              return (
                <polygon
                  key={`${feature.id}:texture`}
                  className={`aware-texture aware-texture-${stateClass(feature.properties.riskState)}`}
                  points={points}
                />
              );
            })}
          </g>
          <g className="aware-evaluated-area-field">
            {props.layer.features.map((feature) => {
              const points = pointsFor(
                feature.geometry.coordinates[0],
                model,
                view.scale,
              );
              return (
                <polygon
                  key={`${feature.id}:evaluated`}
                  className="aware-evaluated-area"
                  points={points}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div className="aware-map-controls" aria-label="Map controls">
        <button
          type="button"
          onClick={() => zoomBy(0.18)}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.18)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset map"
          title="Reset map"
        >
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function weatherLayerFor(
  region: Region,
  signals: WeatherSignal[],
  localized: boolean,
): WeatherMapLayer {
  const bySignal = new Map(signals.map((signal) => [signal.signal, signal]));
  const span = localized ? 0.12 : 9.6;
  const cells = [
    {
      signal: "weather.heat" as const,
      dx: -0.36,
      dy: -0.14,
      width: 0.7,
      height: 0.58,
    },
    {
      signal: "weather.heavy_rain" as const,
      dx: 0.24,
      dy: 0.2,
      width: 0.76,
      height: 0.62,
    },
    {
      signal: "weather.uv" as const,
      dx: -0.02,
      dy: -0.45,
      width: 0.58,
      height: 0.46,
    },
  ];

  return {
    features: cells.map((cell) => {
      const signal = bySignal.get(cell.signal) ?? fallbackSignal(cell.signal);
      const centerLatitude = region.latitude + cell.dy * span;
      const centerLongitude = region.longitude + cell.dx * span;
      return {
        id: signal.id,
        geometry: {
          coordinates: [
            rectangleRing(
              centerLatitude,
              centerLongitude,
              span * cell.height,
              span * cell.width,
            ),
          ],
        },
        properties: {
          label: signal.label,
          riskState: stateForSeverity(signal.severity),
          riskScore: scoreForSeverity(signal.severity),
        },
      };
    }),
  };
}

function rectangleRing(
  latitude: number,
  longitude: number,
  height: number,
  width: number,
): number[][] {
  const halfHeight = height / 2;
  const halfWidth = width / 2;
  return [
    [longitude - halfWidth, latitude - halfHeight],
    [longitude + halfWidth, latitude - halfHeight],
    [longitude + halfWidth, latitude + halfHeight],
    [longitude - halfWidth, latitude + halfHeight],
    [longitude - halfWidth, latitude - halfHeight],
  ];
}

function fallbackSignal(signal: WeatherSignal["signal"]): WeatherSignal {
  return {
    id: `fallback-${signal.replace("weather.", "")}`,
    signal,
    label: labelForSignal(signal),
    attentionLevel: "normal",
    attentionLabel: "Normal",
    severity: 0,
    meaning: "No elevated weather signal is available.",
    updatedAt: new Date(0).toISOString(),
    sourceIds: [],
  };
}

function labelForSignal(
  signal: WeatherSignal["signal"],
): WeatherSignal["label"] {
  if (signal === "weather.heat") return "Heat";
  if (signal === "weather.heavy_rain") return "Rain";
  return "UV";
}

function stateForSeverity(severity: WeatherSignal["severity"]): ConcernState {
  if (severity >= 3) return "Act carefully";
  if (severity >= 2) return "Prepare";
  if (severity >= 1) return "Pay attention";
  return "No clear concern";
}

function scoreForSeverity(severity: WeatherSignal["severity"]): number {
  if (severity >= 4) return 94;
  if (severity === 3) return 78;
  if (severity === 2) return 56;
  if (severity === 1) return 32;
  return 10;
}

function stateClass(state: ConcernState): string {
  if (state === "No clear concern") return "clear";
  if (state === "Pay attention") return "watch";
  if (state === "Prepare") return "prepare";
  if (state === "Act carefully") return "careful";
  return "unknown";
}

function heatOpacity(score: number, weight = 1): string {
  return String(clamp((0.18 + score / 116) * weight, 0.14, 0.9));
}

function pointsFor(
  ring: number[][] | undefined,
  model: MapModel,
  scale: number,
): string {
  return projectedRing(ring, model, scale)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function continuousHeatPoints(
  features: WeatherMapFeature[],
  model: MapModel,
  scale: number,
) {
  const anchors = features.map((feature) => {
    const worldCenter = centroidWorld(
      feature.geometry.coordinates[0],
      model.zoom,
    );
    const screenCenter = worldToScreen(worldCenter, model, scale);
    return {
      id: feature.id,
      x: screenCenter.x,
      y: screenCenter.y,
      worldX: worldCenter.x,
      worldY: worldCenter.y,
      score: feature.properties.riskScore,
      state: feature.properties.riskState,
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
  const startWorldX =
    Math.floor((topLeft.x - paddingWorld) / stepWorld) * stepWorld;
  const endWorldX =
    Math.ceil((bottomRight.x + paddingWorld) / stepWorld) * stepWorld;
  const startWorldY =
    Math.floor((topLeft.y - paddingWorld) / stepWorld) * stepWorld;
  const endWorldY =
    Math.ceil((bottomRight.y + paddingWorld) / stepWorld) * stepWorld;

  for (let worldX = startWorldX; worldX <= endWorldX; worldX += stepWorld) {
    for (let worldY = startWorldY; worldY <= endWorldY; worldY += stepWorld) {
      const screen = worldToScreen({ x: worldX, y: worldY }, model, scale);
      const blended = blendedHeat(
        { x: worldX, y: worldY },
        anchors,
        model,
        scale,
      );
      const edgeDistance = Math.max(
        0,
        -screen.x,
        screen.x - model.width,
        -screen.y,
        screen.y - model.height,
      );
      points.push({
        id: `ambient:${Math.round(worldX)}:${Math.round(worldY)}`,
        x: screen.x,
        y: screen.y,
        radius: (stepWorld * 0.78 + blended.score / 4) * scale,
        score: blended.score,
        state: heatState(blended.score, blended.nearest.state),
        weight: clamp(
          0.55 - edgeDistance / Math.max(model.width, model.height),
          0.32,
          0.58,
        ),
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
      weight: 0.96,
    });
  }

  return points;
}

function blendedHeat(
  world: { x: number; y: number },
  anchors: Array<{
    x: number;
    y: number;
    worldX: number;
    worldY: number;
    score: number;
    state: ConcernState;
  }>,
  model: MapModel,
  scale: number,
) {
  let weightedScore = 0;
  let totalWeight = 0;
  let nearest = anchors[0] ?? {
    x: model.width / 2,
    y: model.height / 2,
    worldX: world.x,
    worldY: world.y,
    score: 0,
    state: "Unknown" as ConcernState,
  };
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const worldDistance = Math.hypot(
      anchor.worldX - world.x,
      anchor.worldY - world.y,
    );
    const distance = worldDistance * 1.05;
    if (distance < nearestDistance) {
      nearest = anchor;
      nearestDistance = distance;
    }
    const weight = 1 / (18 + distance ** 1.35);
    weightedScore += anchor.score * weight;
    totalWeight += weight;
  }
  const localScore =
    totalWeight > 0 ? weightedScore / totalWeight : nearest.score;
  const ambient = ambientHeatScore(world, nearest.score);
  const viewportWorldSpan = Math.max(model.width, model.height) / scale;
  const influence = clamp(
    1 - nearestDistance / Math.max(viewportWorldSpan, 1),
    0,
    1,
  );
  return {
    score: localScore * influence + ambient * (1 - influence),
    nearest,
  };
}

function heatState(score: number, fallback: ConcernState): ConcernState {
  if (fallback === "Unknown") return "Unknown";
  if (score >= 75) return "Act carefully";
  if (score >= 50) return "Prepare";
  if (score >= 25) return "Pay attention";
  return "No clear concern";
}

function projectedRing(
  ring: number[][] | undefined,
  model: MapModel,
  scale: number,
): Array<{ x: number; y: number }> {
  return (ring ?? []).map((pair) => {
    const longitude = pair[0] ?? 0;
    const latitude = pair[1] ?? 0;
    return worldToScreen(
      worldPixelFromLonLat(latitude, longitude, model.zoom),
      model,
      scale,
    );
  });
}

function centroid(points: Array<{ x: number; y: number }>): {
  x: number;
  y: number;
} {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function centroidWorld(
  ring: number[][] | undefined,
  zoom: number,
): { x: number; y: number } {
  const points = (ring ?? []).map((pair) =>
    worldPixelFromLonLat(pair[1] ?? 0, pair[0] ?? 0, zoom),
  );
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
      y: base.y - view.y / view.scale,
    },
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
  const tiles: Array<{ url: string; left: number; top: number; size: number }> =
    [];

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= maxTile) continue;
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const wrappedTileX = modulo(tileX, maxTile);
      const screen = worldToScreen(
        { x: tileX * tileSize, y: tileY * tileSize },
        model,
        scale,
      );
      tiles.push({
        url: `https://tile.openstreetmap.org/${model.zoom}/${wrappedTileX}/${tileY}.png`,
        left: screen.x,
        top: screen.y,
        size: scaledTileSize,
      });
    }
  }
  return tiles;
}

function worldPixelFromLonLat(
  latitude: number,
  longitude: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 2 ** zoom;
  const tileSize = 256;
  const clippedLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const latRad = (clippedLatitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * scale * tileSize,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      scale *
      tileSize,
  };
}

function worldToScreen(
  world: { x: number; y: number },
  model: MapModel,
  scale: number,
): { x: number; y: number } {
  return {
    x: model.width / 2 + (world.x - model.centerWorld.x) * scale,
    y: model.height / 2 + (world.y - model.centerWorld.y) * scale,
  };
}

function screenToWorld(
  x: number,
  y: number,
  model: MapModel,
  scale: number,
): { x: number; y: number } {
  return {
    x: model.centerWorld.x + (x - model.width / 2) / scale,
    y: model.centerWorld.y + (y - model.height / 2) / scale,
  };
}

function ambientHeatScore(
  world: { x: number; y: number },
  baseline: number,
): number {
  const wave =
    Math.sin(world.x * 0.012 + world.y * 0.007) * 8 +
    Math.sin(world.x * 0.004 - world.y * 0.013) * 5;
  return clamp(baseline * 0.58 + 20 + wave, 8, baseline >= 75 ? 82 : 68);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
