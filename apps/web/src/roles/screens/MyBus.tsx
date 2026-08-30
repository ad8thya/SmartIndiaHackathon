/**
 * Bus driver's home screen: their bus's live telemetry. There's no login
 * yet anywhere in Urban Twin, so "which bus is mine" is a picker rather than
 * something the backend already knows — same honest workaround as the field
 * app's hardcoded MY_TEAM.
 */

import { Camera, Gauge, MapPin, Navigation2, Users } from 'lucide-react';
import { useRoles } from '../store';

export function MyBus() {
  const buses = useRoles((s) => s.buses);
  const selectedBusId = useRoles((s) => s.selectedBusId);
  const selectBus = useRoles((s) => s.selectBus);
  const loading = useRoles((s) => s.loading);

  const bus = buses.find((b) => b.bus_id === selectedBusId) ?? buses[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line px-4 py-3 lg:px-6">
        <h1 className="text-base font-medium tracking-tight text-ink">My Bus</h1>
        <p className="text-[11px] text-muted">{buses.length} buses on the fleet</p>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto p-4">
        {buses.length > 1 && (
          <select
            value={bus?.bus_id ?? ''}
            onChange={(e) => selectBus(e.target.value)}
            className="mb-4 w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-ink"
          >
            {buses.map((b) => (
              <option key={b.bus_id} value={b.bus_id}>
                {b.bus_id} · {b.route_id}
              </option>
            ))}
          </select>
        )}

        {loading && !bus && <p className="text-sm text-muted">Loading fleet…</p>}
        {!loading && !bus && <p className="text-sm text-muted">No buses online right now.</p>}

        {bus && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-line bg-surface2 p-4">
              <p className="text-[10px] tracking-wider text-muted">Bus</p>
              <p className="text-lg font-medium text-ink">{bus.bus_id}</p>
              <p className="text-[12px] text-muted">Route {bus.route_id}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] tracking-wider text-muted">
                  <Gauge size={11} /> Speed
                </p>
                <p className="mt-1 font-mono text-sm text-ink">{bus.speed_kmph.toFixed(0)} km/h</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] tracking-wider text-muted">
                  <Users size={11} /> Occupancy
                </p>
                <p className="mt-1 font-mono text-sm text-ink">{bus.occupancy_pct.toFixed(0)}%</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] tracking-wider text-muted">
                  <MapPin size={11} /> Next stop
                </p>
                <p className="mt-1 truncate text-sm text-ink">{bus.next_stop ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
                <p className="flex items-center gap-1 text-[10px] tracking-wider text-muted">
                  <Navigation2 size={11} /> Delay
                </p>
                <p className="mt-1 font-mono text-sm text-ink">
                  {bus.delay_min > 0 ? `+${bus.delay_min.toFixed(0)} min` : 'on time'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-line bg-surface2 p-4 text-center">
              <Camera size={22} className="mx-auto text-muted" />
              <p className="mt-1.5 text-[11px] text-muted">
                Camera status isn't exposed by the API yet — this card is a placeholder for the
                edge device health feed described in the RBAC matrix.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
