/**
 * Four camera tiles: front, rear, left, right.
 *
 * Reads `GET /api/fleet/{bus_id}/cameras`. What that endpoint can honestly
 * report, it reports: whether the bus is still sending frames, and how old the
 * newest one is. What it cannot sense — a covered lens — it simulates, and it
 * says so on every row via `derived`. This screen surfaces that flag rather
 * than hiding it, because a driver who is told "left lens blocked" and finds a
 * clean lens stops trusting the whole screen.
 *
 * There is still no video. The tiles are flat surfaces with an icon, not
 * blurred stock frames: a fake still is the one thing that would make this
 * screen a lie rather than an honest summary.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, Circle, Info, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useMyBus } from '../../lib/useFleet';
import type { CameraStatus } from '../../lib/types';

const LENS_LABEL: Record<string, string> = {
  front: 'Front',
  rear: 'Rear',
  left: 'Left',
  right: 'Right',
};

function frameAge(seconds: number | null): string {
  if (seconds === null) return 'No signal';
  if (seconds < 5) return 'Last frame just now';
  if (seconds < 90) return `Last frame ${Math.round(seconds)}s ago`;
  return `Last frame ${Math.round(seconds / 60)} min ago`;
}

export function CamerasScreen() {
  const { bus, loaded } = useMyBus();
  const [cameras, setCameras] = useState<CameraStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bus) return;
    let live = true;

    const poll = () => {
      void api
        .busCameras(bus.bus_id)
        .then((rows) => live && (setCameras(rows), setError(null)))
        .catch((cause: unknown) =>
          live
            ? setError(cause instanceof Error ? cause.message : 'could not reach the fleet service')
            : undefined,
        );
    };

    poll();
    // Camera state changes on the timescale of a bus stopping or a lens being
    // wiped, not a frame. 15s keeps "last frame" honest without polling a
    // screen nobody is watching most of the time.
    const timer = setInterval(poll, 15_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [bus]);

  const obstructed = (cameras ?? []).filter((camera) => camera.state === 'OBSTRUCTED');
  const anyDerived = (cameras ?? []).some((camera) => camera.derived);

  if (loaded && !bus) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-ink/[0.05] text-ink-muted">
          <CameraOff size={28} />
        </span>
        <h1 className="mt-4 text-[18px] font-medium">No bus assigned</h1>
        <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-soft">
          Your cameras appear here once a bus is running under your depot.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-10 pt-3">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
          {bus ? bus.bus_id : 'Cameras'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {(cameras ?? [null, null, null, null]).map((camera, index) => {
          const state = camera?.state ?? 'OFFLINE';
          const label = camera ? (LENS_LABEL[camera.lens] ?? camera.lens) : '—';
          return (
            <div key={camera?.lens ?? index} className="ut-card overflow-hidden">
              <div
                className={`flex h-24 items-center justify-center ${
                  state === 'OBSTRUCTED' ? 'bg-amber/10' : 'bg-ink/[0.05]'
                }`}
              >
                {!camera ? (
                  <Loader2 size={20} className="animate-spin text-ink-faint" />
                ) : state === 'OFFLINE' ? (
                  <CameraOff size={22} className="text-ink-faint" />
                ) : state === 'OBSTRUCTED' ? (
                  <AlertTriangle size={22} className="text-amber" />
                ) : (
                  <Camera size={22} className="text-ink-faint" />
                )}
              </div>

              <div className="p-3">
                <div className="flex items-center gap-1.5">
                  <Circle
                    size={8}
                    className={
                      state === 'OK'
                        ? 'fill-emerald text-emerald'
                        : state === 'OBSTRUCTED'
                          ? 'fill-amber text-amber'
                          : 'fill-ink-faint text-ink-faint'
                    }
                  />
                  <span className="text-[13px] font-medium">{label}</span>
                </div>

                <div className="mt-1 text-[11px] leading-snug text-ink-soft">
                  {!camera
                    ? 'Checking…'
                    : state === 'OBSTRUCTED'
                      ? 'Lens obstructed'
                      : frameAge(camera.last_frame_age_s)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {obstructed.length > 0 ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-[12px] bg-amber/10 px-3.5 py-3">
          <AlertTriangle size={15} className="mt-0.5 flex-none text-amber" />
          <p className="text-[12px] leading-relaxed text-amber">
            A blocked lens stops that side contributing road data. Wipe it at the next stop — you do
            not need to report it.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-[12px] bg-ink/[0.04] px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
          Could not reach the fleet service. The tiles above are the last state this phone received.
        </p>
      ) : null}

      {/* The `derived` flag comes off the wire, so this note tracks what the
          API actually claims rather than being a hardcoded caveat that would
          go stale the day real camera health lands. */}
      {anyDerived ? (
        <div className="mt-4 flex items-start gap-2.5">
          <Info size={14} className="mt-0.5 flex-none text-ink-faint" />
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Online state and frame age come from your bus. Lens obstruction is not something the
            bus can report yet, so that state is simulated — it is here so you recognise it before
            the day it happens. There is no live video on this phone.
          </p>
        </div>
      ) : null}
    </div>
  );
}
