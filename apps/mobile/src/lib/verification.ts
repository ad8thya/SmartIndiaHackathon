/**
 * How far the fleet has got confirming a repair this crew claimed.
 *
 * Mirrors `services/cloud/api/routers/verification.py`. Not generated from
 * `packages/contracts` because it is not a wire contract between modules —
 * it is a view of one process's live state that only this screen reads, and
 * putting it in the frozen layer would mean an amendment for something no
 * other module consumes.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface VerificationStatus {
  event_id: string;
  road_segment_id: string | null;
  clean_passes: number;
  passes_required: number;
  distinct_buses: number;
  buses_required: number;
  buses_seen: string[];
  dirty_passes: number;
  confidence: number;
  last_pass_at: string | null;
  pending_since: string | null;
  /** No bus has driven this road recently. */
  stalled: boolean;
  /** The threshold cannot be met here — a human has to sign it off. */
  needs_manual: boolean;
  detail: string;
}

/**
 * Polled rather than pushed. Progress changes when a bus drives past, which is
 * a physical event on the order of minutes, and adding a WebSocket message
 * type for it would mean another contracts amendment for something one screen
 * reads while it is open.
 */
const POLL_MS = 5_000;

export function useVerification() {
  const [rows, setRows] = useState<VerificationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.verification());
      setError(null);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'could not load verification progress');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { rows, error, reload: load };
}

/** Index by event id, so a card can find its own progress. */
export function byEvent(rows: VerificationStatus[] | null): Record<string, VerificationStatus> {
  return Object.fromEntries((rows ?? []).map((row) => [row.event_id.replace(/-/g, ''), row]));
}
