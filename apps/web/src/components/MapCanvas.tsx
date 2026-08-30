/**
 * The Digital Twin. Owned by M6.
 *
 * Layer order matters — deck.gl draws in array order and the extruded buildings
 * will happily swallow a pin that is drawn under them:
 *
 *   1 PolygonLayer     OSM building footprints, extruded (the "twin" read)
 *   2 PathLayer        route polylines, coloured by congestion
 *   3 HeatmapLayer     congestion (toggleable)
 *   4 ScatterplotLayer events, coloured by workflow status
 *   5 IconLayer        buses, interpolated between position updates
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { FlyToInterpolator, type PickingInfo } from '@deck.gl/core';
// aliased: an unqualified `Map` here would shadow the global Map constructor,
// which this file uses for the bus-interpolation cache
import BaseMap from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useStore } from '../store/useStore';
import { loadBuildings } from '../lib/api';
import { INITIAL_VIEW, OFFLINE_DARK, buildMapStyle } from '../lib/mapStyle';
import { RISK_BAND_HEX, congestionColor, hexToRgba, statusColor } from '../lib/colors';
import { MOTION, STATUS_HEX } from '../lib/tokens';
import type {
  BusPosition,
  GeoJsonFeatureCollection,
  LonLat,
  NearMissEvent,
  RoadCondition,
  UTEvent,
} from '../lib/types';

/** one ring expansion, ms */
const PULSE_MS = 1600;
/** how many times a newly-escalated pin pulses before going quiet */
const PULSE_REPEATS = 3;

/** A warning-diamond SVG — deliberately distinct from the incident/event dots
 * so a near-miss never reads as "just another pothole pin". */
const NEAR_MISS_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="14" y="14" width="36" height="36" rx="6" fill="#f59e0b" fill-opacity="0.25"
        transform="rotate(45 32 32)"/>
      <rect x="18" y="18" width="28" height="28" rx="4" fill="#1c1206" stroke="#f59e0b"
        stroke-width="3" transform="rotate(45 32 32)"/>
      <path d="M32 22 L32 36 M32 42 L32 43" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
  );

/** A bus SVG baked into a data URI — no network, no sprite sheet. */
const BUS_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="26" fill="#0ea5e9" fill-opacity="0.22"/>
      <circle cx="32" cy="32" r="17" fill="#0b1220" stroke="#38bdf8" stroke-width="3"/>
      <path d="M32 15 L40 34 L32 30 L24 34 Z" fill="#7dd3fc"/>
    </svg>`,
  );

/** what this map holds in state — deck's own ViewState union is wider. */
interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
  transitionInterpolator?: FlyToInterpolator;
  transitionEasing?: (t: number) => number;
}

interface BusRender extends BusPosition {
  renderLat: number;
  renderLon: number;
}

/**
 * Buses report roughly once a second. Drawing only on those updates makes them
 * teleport, so we interpolate towards the newest position every animation
 * frame. This is the single change that makes the map feel alive.
 */
function useSmoothedBuses(buses: BusPosition[]): BusRender[] {
  const positions = useRef(new Map<string, { lat: number; lon: number }>());
  const [, force] = useState(0);

  useEffect(() => {
    let frame = 0;
    const step = () => {
      let moved = false;
      for (const bus of buses) {
        const current = positions.current.get(bus.bus_id) ?? { lat: bus.lat, lon: bus.lon };
        const next = {
          lat: current.lat + (bus.lat - current.lat) * 0.16,
          lon: current.lon + (bus.lon - current.lon) * 0.16,
        };
        if (Math.abs(next.lat - current.lat) > 1e-7 || Math.abs(next.lon - current.lon) > 1e-7) {
          moved = true;
        }
        positions.current.set(bus.bus_id, next);
      }
      if (moved) force((n) => n + 1);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [buses]);

  return buses.map((bus) => {
    const smoothed = positions.current.get(bus.bus_id) ?? { lat: bus.lat, lon: bus.lon };
    return { ...bus, renderLat: smoothed.lat, renderLon: smoothed.lon };
  });
}

interface BusTrail {
  busId: string;
  path: LonLat[];
  timestamps: number[];
}

/**
 * Rolling trajectory per bus for the TripsLayer playback trail. Timestamps
 * are seconds since page load, so `currentTime` can just be the clock.
 */
function useBusTrails(buses: BusPosition[]): { trails: BusTrail[]; now: number } {
  const store = useRef(new Map<string, BusTrail>());
  const t0 = useRef(performance.now());
  const [now, setNow] = useState(0);

  useEffect(() => {
    const clock = (performance.now() - t0.current) / 1000;
    for (const bus of buses) {
      const trail = store.current.get(bus.bus_id) ?? {
        busId: bus.bus_id,
        path: [],
        timestamps: [],
      };
      const last = trail.path[trail.path.length - 1];
      if (!last || last[0] !== bus.lon || last[1] !== bus.lat) {
        trail.path.push([bus.lon, bus.lat]);
        trail.timestamps.push(clock);
        // keep a bounded window — the trail is a read of "where has this bus
        // just been", not a full history
        if (trail.path.length > 120) {
          trail.path.shift();
          trail.timestamps.shift();
        }
      }
      store.current.set(bus.bus_id, trail);
    }
  }, [buses]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow((performance.now() - t0.current) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { trails: [...store.current.values()], now };
}

export function MapCanvas() {
  const events = useStore((s) => s.visibleEvents());
  const eventsById = useStore((s) => s.events);
  const routes = useStore((s) => s.routes);
  const roads = useStore((s) => s.roads);
  const buses = useStore((s) => s.busList());
  const showHeatmap = useStore((s) => s.showHeatmap);
  const showBuildings = useStore((s) => s.showBuildings);
  const showRiskLayer = useStore((s) => s.showRiskLayer);
  const nearMisses = useStore((s) => s.nearMisses);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const selectedRoadId = useStore((s) => s.selectedRoadId);
  const selectRoad = useStore((s) => s.selectRoad);
  const selectEvent = useStore((s) => s.selectEvent);
  const escalations = useStore((s) => s.escalations);

  const [viewState, setViewState] = useState<ViewState>(INITIAL_VIEW);
  const [buildings, setBuildings] = useState<GeoJsonFeatureCollection | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  // the basemap is a committed PMTiles extract served by this app — built
  // synchronously, no probe, no CDN, works with the wifi off
  const mapStyle = useMemo<StyleSpecification>(() => {
    try {
      return buildMapStyle('dark');
    } catch {
      return OFFLINE_DARK;
    }
  }, []);

  useEffect(() => {
    // fetched once from a cached local file — never from Overpass at runtime
    loadBuildings().then(setBuildings);
  }, []);

  /**
   * Fly to whatever was just selected, from anywhere — a list row, a ticker
   * entry, an escalation toast. Eased and time-bounded rather than a jump,
   * so an operator keeps their bearings: a map that teleports loses the
   * viewer's mental model of where they were.
   */
  const flyTo = useCallback((lon: number, lat: number, zoom = 15) => {
    setViewState((current) => ({
      ...current,
      longitude: lon,
      latitude: lat,
      zoom: Math.max(current.zoom, zoom),
      transitionDuration: MOTION.flyTo,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
      transitionEasing: (t: number) => t * (2 - t), // easeOutQuad, never bouncy
    }));
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const event = eventsById[selectedEventId];
    if (event) flyTo(event.lon, event.lat);
  }, [selectedEventId, eventsById, flyTo]);

  const smoothedBuses = useSmoothedBuses(buses);
  const { trails, now } = useBusTrails(buses);

  /**
   * Expanding rings on events that just climbed the fusion ladder. This is the
   * one piece of motion on the map that is not decoration: it is how an
   * operator notices that corroboration turned a guess into a work order,
   * which is the entire thesis. Rings expand and fade, three times, then the
   * escalation retires itself from the store.
   */
  const pulses = useMemo(() => {
    const clock = Date.now();
    return escalations
      .map((item) => {
        const event = eventsById[item.eventId];
        if (!event) return null;
        const age = clock - item.at;
        if (age > PULSE_MS * PULSE_REPEATS) return null;
        return {
          eventId: item.eventId,
          position: [event.lon, event.lat] as LonLat,
          status: item.to,
          phase: (age % PULSE_MS) / PULSE_MS,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    // `now` is the animation clock — it ticks every frame, which is what keeps
    // the rings expanding between store updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalations, eventsById, now]);

  /** congestion per route, averaged over that route's segments */
  const routeCongestion = useMemo(() => {
    const byRoute = new Map<string, number[]>();
    for (const road of roads) {
      const routeId = road.road_id.split('-')[1] ?? '';
      byRoute.set(routeId, [...(byRoute.get(routeId) ?? []), road.congestion_pct]);
    }
    const averaged = new Map<string, number>();
    byRoute.forEach((values, routeId) => {
      averaged.set(routeId, values.reduce((a, b) => a + b, 0) / values.length);
    });
    return averaged;
  }, [roads]);

  /**
   * These two must keep a stable identity across renders. The bus animation
   * re-renders this component every frame; deck.gl compares `data` by
   * reference, so rebuilding these arrays inline would re-tesselate 7,177
   * building footprints sixty times a second.
   */
  const buildingData = useMemo(
    () =>
      (buildings?.features ?? []).map((feature) => ({
        polygon: (feature.geometry.coordinates as LonLat[][])[0] ?? [],
        height: Number(feature.properties.height ?? 12),
      })),
    [buildings],
  );

  const routeData = useMemo(
    () =>
      routes.map((route) => ({
        path: route.polyline,
        routeId: route.route_id,
        name: route.name,
        congestion: routeCongestion.get(route.route_id) ?? 20,
      })),
    [routes, routeCongestion],
  );

  const layers = useMemo(() => {
    const list = [];

    // 1 ── the twin itself
    if (showBuildings && buildingData.length) {
      list.push(
        new PolygonLayer<{ polygon: LonLat[]; height: number }>({
          id: 'buildings',
          data: buildingData,
          extruded: true,
          filled: true,
          wireframe: false,
          getPolygon: (d) => d.polygon,
          getElevation: (d) => d.height,
          getFillColor: [30, 41, 66, 190],
          getLineColor: [56, 189, 248, 40],
          lineWidthMinPixels: 1,
          material: { ambient: 0.4, diffuse: 0.6, shininess: 24, specularColor: [40, 60, 90] },
          pickable: false,
        }),
      );
    }

    // 2 ── routes, coloured by how badly they are moving
    list.push(
      new PathLayer<{ path: LonLat[]; routeId: string; name: string; congestion: number }>({
        id: 'routes',
        data: routeData,
        getPath: (d) => d.path,
        getColor: (d) => congestionColor(d.congestion, 210),
        getWidth: 5,
        widthMinPixels: 3,
        widthMaxPixels: 10,
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onHover: (info: PickingInfo) => {
          const item = info.object as { name?: string; congestion?: number } | null;
          setHover(
            item && info.x != null
              ? {
                  x: info.x,
                  y: info.y ?? 0,
                  text: `${item.name} · ${Math.round(item.congestion ?? 0)}% congested`,
                }
              : null,
          );
        },
      }),
    );

    // 3 ── congestion heatmap (toggleable)
    if (showHeatmap && roads.length) {
      list.push(
        new HeatmapLayer<{ position: LonLat; weight: number }>({
          id: 'congestion-heat',
          data: roads.map((road) => ({
            position: roadCenter(road.road_id, routes),
            weight: road.congestion_pct,
          })),
          getPosition: (d) => d.position,
          getWeight: (d) => d.weight,
          radiusPixels: 90,
          intensity: 1.2,
          threshold: 0.05,
          colorRange: [
            [34, 197, 94, 60],
            [163, 230, 53, 110],
            [250, 204, 21, 160],
            [249, 115, 22, 200],
            [239, 68, 68, 230],
            [220, 38, 38, 255],
          ],
        }),
      );
    }

    // 3.5 ── urban risk bands per road, toggleable (mutually legible against
    // the congestion heatmap — both colour the same geometry differently, so
    // this is a separate toggle, not layered underneath it)
    if (showRiskLayer && roads.length) {
      list.push(
        new ScatterplotLayer<RoadCondition & { position: LonLat }>({
          id: 'risk-bands',
          data: roads
            .filter((road) => road.risk_band)
            .map((road) => ({ ...road, position: roadCenter(road.road_id, routes) })),
          getPosition: (d) => d.position,
          getFillColor: (d) =>
            hexToRgba(RISK_BAND_HEX[d.risk_band!], d.road_id === selectedRoadId ? 255 : 190),
          getLineColor: (d) =>
            d.road_id === selectedRoadId ? [255, 255, 255, 255] : hexToRgba('#0b1220', 160),
          getRadius: (d) => (d.risk_band === 'CRITICAL' ? 90 : d.risk_band === 'HIGH' ? 65 : 45),
          radiusMinPixels: 5,
          radiusMaxPixels: 26,
          stroked: true,
          lineWidthMinPixels: 1,
          pickable: true,
          updateTriggers: { getFillColor: selectedRoadId, getLineColor: selectedRoadId },
          onHover: (info: PickingInfo) => {
            const road = info.object as RoadCondition | null;
            setHover(
              road && info.x != null
                ? {
                    x: info.x,
                    y: info.y ?? 0,
                    text: `${road.name} · risk ${road.urban_risk_score?.toFixed(0) ?? '—'} (${road.risk_band})`,
                  }
                : null,
            );
          },
          onClick: (info: PickingInfo) => {
            const road = info.object as RoadCondition | null;
            if (road) selectRoad(road.road_id);
          },
        }),
      );
    }

    // 3.8 ── consensus escalation rings — see `pulses` above
    if (pulses.length) {
      list.push(
        new ScatterplotLayer<(typeof pulses)[number]>({
          id: 'escalation-pulse',
          data: pulses,
          getPosition: (d) => d.position,
          getRadius: (d) => 30 + d.phase * 320,
          getFillColor: [0, 0, 0, 0],
          getLineColor: (d) => hexToRgba(STATUS_HEX[d.status], Math.round(200 * (1 - d.phase))),
          stroked: true,
          filled: false,
          lineWidthMinPixels: 2,
          radiusMinPixels: 6,
          radiusMaxPixels: 90,
          pickable: false,
          updateTriggers: { getRadius: now, getLineColor: now },
        }),
      );
    }

    // 4 ── events, colour by workflow status: grey → amber → red → green
    list.push(
      new ScatterplotLayer<UTEvent>({
        id: 'events',
        data: events,
        getPosition: (d) => [d.lon, d.lat],
        getFillColor: (d) => statusColor(d.status, d.event_id === selectedEventId ? 255 : 200),
        getLineColor: (d) =>
          d.event_id === selectedEventId ? [255, 255, 255, 255] : hexToRgba('#0b1220', 160),
        getRadius: (d) =>
          (d.severity === 'LARGE' ? 46 : d.severity === 'MEDIUM' ? 32 : 22) *
          (d.event_id === selectedEventId ? 1.5 : 1),
        radiusMinPixels: 4,
        radiusMaxPixels: 22,
        stroked: true,
        lineWidthMinPixels: 1.5,
        pickable: true,
        onClick: (info: PickingInfo) => {
          const event = info.object as UTEvent | null;
          if (!event) return;
          selectEvent(event.event_id);
          if (event.road_segment_id) selectRoad(event.road_segment_id);
        },
        onHover: (info: PickingInfo) => {
          const event = info.object as UTEvent | null;
          setHover(
            event && info.x != null
              ? {
                  x: info.x,
                  y: info.y ?? 0,
                  text: `${event.detection_class} · ${event.severity} · ${Math.round(event.fused_confidence * 100)}% · ${event.distinct_bus_count} buses`,
                }
              : null,
          );
        },
        updateTriggers: { getFillColor: selectedEventId, getRadius: selectedEventId },
      }),
    );

    // 4.5 ── near-miss markers — a distinct warning-diamond icon, never
    // confusable with the status-coloured event dots or the incident feed
    if (nearMisses.length) {
      list.push(
        new IconLayer<NearMissEvent>({
          id: 'near-misses',
          data: nearMisses,
          getPosition: (d) => [d.lon, d.lat],
          getIcon: () => ({ url: NEAR_MISS_ICON, width: 64, height: 64, anchorY: 32 }),
          getSize: (d) => (d.severity === 'LARGE' ? 34 : d.severity === 'MEDIUM' ? 28 : 22),
          sizeMinPixels: 16,
          sizeMaxPixels: 34,
          pickable: true,
          onHover: (info: PickingInfo) => {
            const nm = info.object as NearMissEvent | null;
            setHover(
              nm && info.x != null
                ? {
                    x: info.x,
                    y: info.y ?? 0,
                    text: `Near miss · TTC ${nm.min_ttc_seconds.toFixed(1)}s · ${nm.closing_speed_kmph.toFixed(0)} km/h · ${nm.bus_id}`,
                  }
                : null,
            );
          },
          onClick: (info: PickingInfo) => {
            const nm = info.object as NearMissEvent | null;
            if (nm) selectRoad(nm.road_id);
          },
        }),
      );
    }

    // 4.8 ── trajectory playback: a fading trail behind each bus
    if (trails.length) {
      list.push(
        new TripsLayer<BusTrail>({
          id: 'bus-trails',
          data: trails,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          getColor: [56, 189, 248, 160],
          widthMinPixels: 3,
          capRounded: true,
          jointRounded: true,
          fadeTrail: true,
          trailLength: 45,
          currentTime: now,
        }),
      );
    }

    // 5 ── the fleet, on top of everything
    list.push(
      new IconLayer<BusRender>({
        id: 'buses',
        data: smoothedBuses,
        getPosition: (d) => [d.renderLon, d.renderLat],
        getIcon: () => ({ url: BUS_ICON, width: 64, height: 64, anchorY: 32 }),
        getSize: 40,
        sizeMinPixels: 22,
        sizeMaxPixels: 46,
        getAngle: (d) => -d.heading_deg,
        pickable: true,
        onHover: (info: PickingInfo) => {
          const bus = info.object as BusRender | null;
          setHover(
            bus && info.x != null
              ? {
                  x: info.x,
                  y: info.y ?? 0,
                  text: `${bus.bus_id} · route ${bus.route_id} · ${Math.round(bus.speed_kmph)} km/h${bus.next_stop ? ` → ${bus.next_stop}` : ''}`,
                }
              : null,
          );
        },
      }),
      new TextLayer<BusRender>({
        id: 'bus-labels',
        data: smoothedBuses,
        getPosition: (d) => [d.renderLon, d.renderLat],
        getText: (d) => d.route_id,
        getSize: 11,
        getColor: [186, 230, 253, 230],
        getPixelOffset: [0, -26],
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 500,
        // outlineWidth is ignored unless the glyph atlas is signed-distance-
        // field; without this deck.gl warns and draws no outline at all
        fontSettings: { sdf: true },
        outlineWidth: 2,
        outlineColor: [8, 11, 20, 255],
        characterSet: 'auto',
      }),
    );

    return list;
  }, [
    buildingData,
    events,
    nearMisses,
    now,
    roads,
    routes,
    routeData,
    selectEvent,
    selectRoad,
    selectedEventId,
    selectedRoadId,
    showBuildings,
    showHeatmap,
    showRiskLayer,
    smoothedBuses,
    trails,
    pulses,
  ]);

  return (
    <div className="relative h-full w-full">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: next }) => setViewState(next as ViewState)}
        controller={{ dragRotate: true, touchRotate: true }}
        layers={layers}
        getCursor={({ isDragging, isHovering }) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
      >
        <BaseMap mapStyle={mapStyle} reuseMaps attributionControl={false} />
      </DeckGL>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-white/10 bg-ink-800/95 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.text}
        </div>
      )}

      <MapLegend />
    </div>
  );
}

/** Rough centre for a segment id, derived from the route polyline. */
function roadCenter(roadId: string, routes: { route_id: string; polyline: LonLat[] }[]): LonLat {
  const [, routeId, indexText] = roadId.split('-');
  const route = routes.find((r) => r.route_id === routeId);
  if (!route || route.polyline.length === 0) return [80.2707, 13.0827];
  const index = Number(indexText ?? 0);
  const step = Math.floor(route.polyline.length / 5);
  return route.polyline[Math.min(index * step + Math.floor(step / 2), route.polyline.length - 1)];
}

function MapLegend() {
  const showHeatmap = useStore((s) => s.showHeatmap);
  const showRiskLayer = useStore((s) => s.showRiskLayer);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-white/10 bg-ink-800/85 px-3 py-2.5 text-[11px] text-slate-300 backdrop-blur">
      <div className="mb-1.5 font-medium tracking-wider text-slate-400">
        Event status
      </div>
      <div className="flex flex-col gap-1">
        {[
          ['#94a3b8', 'Detected'],
          ['#f59e0b', 'Verified / notified'],
          ['#22c55e', 'Repaired'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      {showHeatmap && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="mb-1 font-medium tracking-wider text-slate-400">
            Congestion
          </div>
          {/* discrete steps, not a gradient — colour means something here, so
              it should be readable off the legend rather than interpolated */}
          <div className="flex w-28 gap-px overflow-hidden rounded-full">
            {['#22c55e', '#a3e635', '#facc15', '#f97316', '#ef4444'].map((step) => (
              <span key={step} className="h-1.5 flex-1" style={{ backgroundColor: step }} />
            ))}
          </div>
        </div>
      )}
      {showRiskLayer && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="mb-1 font-medium tracking-wider text-slate-400">
            Urban risk band
          </div>
          <div className="flex flex-col gap-1">
            {[
              [RISK_BAND_HEX.LOW, 'Low'],
              [RISK_BAND_HEX.MODERATE, 'Moderate'],
              [RISK_BAND_HEX.HIGH, 'High'],
              [RISK_BAND_HEX.CRITICAL, 'Critical'],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-sm border border-amber-400 bg-amber-500/25" />
        <span>Near miss</span>
      </div>
    </div>
  );
}
