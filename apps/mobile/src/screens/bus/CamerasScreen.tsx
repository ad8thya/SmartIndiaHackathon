/**
 * Four camera tiles: front, rear, left, right.
 *
 * ⚠️  There is no video here and there is no camera health endpoint. The
 * online state and last-frame times are DERIVED from the bus's own telemetry —
 * a bus that is reporting positions has cameras that are powered, and the
 * frame age is the age of its last position. That is a real signal, and it is
 * labelled as what it is at the bottom of the screen. It is not a live feed
 * and nothing here says it is.
 *
 * The lens-obstruction state is the exception and it is honest about that too:
 * it is a scripted demonstration of what the warning looks like, marked
 * "example" on the tile, because a crew needs to recognise the state before
 * the day it happens and there is no way to produce a real one on demand.
 */

import { useMemo } from 'react';
import { AlertTriangle, Camera, CameraOff, Circle } from 'lucide-react';
import { useMyBus } from '../../lib/useFleet';
import { timeAgo } from '../../lib/display';

type Lens = { id: string; label: string; state: 'ok' | 'obstructed' | 'offline' };

const LENSES: Lens[] = [
  { id: 'front', label: 'Front', state: 'ok' },
  { id: 'rear', label: 'Rear', state: 'ok' },
  // Scripted, and labelled as such on the tile. See the file header.
  { id: 'left', label: 'Left', state: 'obstructed' },
  { id: 'right', label: 'Right', state: 'ok' },
];

export function CamerasScreen() {
  const { bus, loaded } = useMyBus();

  const lastFrame = useMemo(() => (bus ? timeAgo(bus.ts) : null), [bus]);
  const powered = bus !== null;

  return (
    <div className="px-4 pb-10 pt-3">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="text-[11px] font-medium uppercase tracking-[1.1px] text-ink-muted">
          {bus ? bus.bus_id : 'Cameras'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {LENSES.map((lens) => {
          const state = !powered ? 'offline' : lens.state;
          return (
            <div key={lens.id} className="ut-card overflow-hidden">
              {/* The tile is a placeholder, not a frame. It is flat grey with
                  an icon rather than a blurred stock photo — a fake video
                  still is the exact thing that would make this screen a lie. */}
              <div
                className={`flex h-24 items-center justify-center ${
                  state === 'obstructed' ? 'bg-amber/10' : 'bg-ink/[0.05]'
                }`}
              >
                {state === 'offline' ? (
                  <CameraOff size={22} className="text-ink-faint" />
                ) : state === 'obstructed' ? (
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
                      state === 'ok'
                        ? 'fill-emerald text-emerald'
                        : state === 'obstructed'
                          ? 'fill-amber text-amber'
                          : 'fill-ink-faint text-ink-faint'
                    }
                  />
                  <span className="text-[13px] font-medium">{lens.label}</span>
                </div>

                <div className="mt-1 text-[11px] leading-snug text-ink-soft">
                  {state === 'offline'
                    ? loaded
                      ? 'No signal'
                      : 'Checking…'
                    : state === 'obstructed'
                      ? 'Lens obstructed'
                      : `Last frame ${lastFrame ?? '—'}`}
                </div>

                {state === 'obstructed' ? (
                  <div className="mt-1.5 rounded bg-amber/12 px-1.5 py-0.5 text-[10px] font-medium text-amber">
                    Example state
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {LENSES.some((lens) => lens.state === 'obstructed') && powered ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-[12px] bg-amber/10 px-3.5 py-3">
          <AlertTriangle size={15} className="mt-0.5 flex-none text-amber" />
          <p className="text-[12px] leading-relaxed text-amber">
            A blocked lens stops that side contributing road data. Wipe it at the next stop — you do
            not need to report it.
          </p>
        </div>
      ) : null}

      {/* The honesty note. Without it this screen implies a camera health feed
          that does not exist. */}
      <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
        Camera status is inferred from your bus telemetry — a bus that is reporting its position has
        powered cameras, and “last frame” is the age of that report. There is no live video on this
        phone, and the obstruction tile above is a marked example so you can recognise it.
      </p>
    </div>
  );
}
