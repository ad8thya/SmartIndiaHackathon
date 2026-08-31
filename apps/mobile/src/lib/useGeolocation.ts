/**
 * Where the phone is.
 *
 * Geolocation fails in more ways than it succeeds, and every one of them is
 * ordinary rather than exceptional: permission denied, a browser that only
 * offers it over https, a laptop with no GPS, a phone indoors, a demo venue
 * basement. So this never throws and never leaves the caller hanging — it
 * always settles into a state a screen can render, and every screen that uses
 * it must work with `coords === null`.
 *
 * The fallback is Chennai Central, and it is labelled as a fallback wherever
 * it is shown. Silently presenting a default as the user's location is how a
 * citizen ends up reporting a pothole at an address they have never visited.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_VIEW } from './mapStyle';

export type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; lat: number; lon: number; accuracy_m: number }
  | { status: 'denied' }
  | { status: 'unavailable'; why: string };

/** True when we have a real fix, rather than a fallback standing in for one. */
export function isRealFix(state: GeoState): state is Extract<GeoState, { status: 'ok' }> {
  return state.status === 'ok';
}

/** Somewhere to put the map when there is no fix. Always labelled as such. */
export const FALLBACK_POSITION = { lat: INITIAL_VIEW.lat, lon: INITIAL_VIEW.lon };

export function useGeolocation({ watch = false }: { watch?: boolean } = {}) {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const watchId = useRef<number | null>(null);

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'unavailable', why: 'this browser has no location support' });
      return;
    }

    setState({ status: 'locating' });

    const onSuccess = (position: GeolocationPosition) =>
      setState({
        status: 'ok',
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
      });

    const onError = (error: GeolocationPositionError) =>
      setState(
        error.code === error.PERMISSION_DENIED
          ? { status: 'denied' }
          : {
              status: 'unavailable',
              why:
                error.code === error.TIMEOUT
                  ? 'no fix yet — try again outdoors'
                  : 'location is unavailable here',
            },
      );

    const options: PositionOptions = {
      enableHighAccuracy: true,
      // 12s: long enough for a cold GPS fix outdoors, short enough that a
      // spinner does not sit on screen looking hung.
      timeout: 12_000,
      maximumAge: 30_000,
    };

    if (watch) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = navigator.geolocation.watchPosition(onSuccess, onError, options);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    }
  }, [watch]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return { state, locate };
}
