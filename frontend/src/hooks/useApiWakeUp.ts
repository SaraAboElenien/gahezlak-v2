import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getApiActivitySnapshot,
  getApiActivityServerSnapshot,
  subscribeApiActivity,
} from "@/services/apiActivity";

/**
 * How long a request has to be outstanding before we say anything.
 *
 * Chosen so an ordinary load never flashes the notice: a warm request to the
 * API settles in a few hundred milliseconds, an order of magnitude under this.
 * Anything still pending at ~2.8s on this backend is a Render cold start, and
 * a cold start takes ~50s — so being a little slow to explain costs nothing,
 * while explaining too eagerly makes a healthy site look broken.
 */
export const WAKE_UP_THRESHOLD_MS = 2800;

/** Render's advertised free-tier cold start is ~50s; budget a little over. */
export const WAKE_UP_ESTIMATE_MS = 60_000;

/** Repaint cadence for the elapsed counter — smooth enough, cheap enough. */
const TICK_MS = 500;

export interface ApiWakeUpState {
  /** True once an API request has been outstanding past the threshold. */
  isWaking: boolean;
  /** How long the longest outstanding request has been running. */
  elapsedMs: number;
  /** The estimate shown to the visitor, so the caller can render progress. */
  estimatedMs: number;
}

/**
 * "Have we been waiting on the API long enough to owe the visitor an
 * explanation?" — the single source of truth behind the wake-up UI.
 *
 * Reads from the shared request tracker rather than any one query, so it is
 * correct wherever it is mounted and there is nothing to wire up per page.
 */
export function useApiWakeUp(
  thresholdMs: number = WAKE_UP_THRESHOLD_MS,
): ApiWakeUpState {
  const { oldestStartedAt } = useSyncExternalStore(
    subscribeApiActivity,
    getApiActivitySnapshot,
    getApiActivityServerSnapshot,
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (oldestStartedAt === null) {
      setElapsedMs(0);
      return;
    }

    const tick = () => setElapsedMs(Date.now() - oldestStartedAt);
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [oldestStartedAt]);

  return {
    isWaking: oldestStartedAt !== null && elapsedMs >= thresholdMs,
    elapsedMs,
    estimatedMs: WAKE_UP_ESTIMATE_MS,
  };
}
