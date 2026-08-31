/**
 * The map, loaded only when a map screen is opened.
 *
 * maplibre-gl plus its style layers is around 900 kB of the bundle — more than
 * everything else in this app put together. Most sessions never open a map: a
 * citizen reporting a pothole goes home → report → sent, and a driver checking
 * cameras never leaves two list screens. Shipping the map to all of them makes
 * the first load slower on exactly the connection least able to afford it.
 *
 * So it is a separate chunk, fetched on the first map screen and cached by the
 * service worker afterwards. Types are imported with `import type`, which is
 * erased at build time and does not pull the module back into the main bundle
 * — an ordinary `import { type X }` here would silently undo the whole thing.
 */

import { lazy, Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { UTMap as UTMapType } from './UTMap';

const UTMap = lazy(() => import('./UTMap').then((module) => ({ default: module.UTMap })));

export function LazyMap(props: ComponentProps<typeof UTMapType>) {
  return (
    <Suspense
      fallback={
        // The map's own ground colour rather than a spinner: on a fast
        // connection this is on screen for a few frames, and a spinner that
        // flashes is more distracting than a plain surface.
        <div className="h-full w-full animate-pulse bg-ink/[0.04]" />
      }
    >
      <UTMap {...props} />
    </Suspense>
  );
}
