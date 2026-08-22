/**
 * A tiny store of "is the API answering, and how long have we been waiting?".
 *
 * WHY
 * ---
 * The demo backend is a Render free-tier service that spins down after ~15
 * minutes idle and takes ~50 seconds to wake. Every loading state in this app
 * was written for a request that takes a few hundred milliseconds, so during a
 * cold start a visitor sits in front of a bare spinner — or a blank page — for
 * the better part of a minute with no idea whether anything is happening.
 *
 * Nothing in the app can distinguish "slow" from "broken" without knowing when
 * the request started, so that is all this records: every in-flight API call's
 * start time, published through `useSyncExternalStore`. `useApiWakeUp` turns it
 * into "we have been waiting long enough to owe the visitor an explanation".
 *
 * It is deliberately not a react-query concern: the boot-time silent refresh in
 * UserContext goes through bare axios, and it is usually the *first* request a
 * visitor makes — so it is exactly the one that discovers a sleeping API.
 */

export interface ApiActivitySnapshot {
  /** How many API requests are currently in flight. */
  pending: number;
  /** `Date.now()` of the longest-running in-flight request, or null if idle. */
  oldestStartedAt: number | null;
}

const IDLE: ApiActivitySnapshot = { pending: 0, oldestStartedAt: null };

const inFlight = new Map<number, number>();
const listeners = new Set<() => void>();
let sequence = 0;
let snapshot: ApiActivitySnapshot = IDLE;

function publish(): void {
  let oldest: number | null = null;
  for (const startedAt of inFlight.values()) {
    if (oldest === null || startedAt < oldest) oldest = startedAt;
  }

  // `useSyncExternalStore` compares snapshots by identity and re-renders on
  // every change, so only allocate a new one when something actually moved.
  if (inFlight.size === snapshot.pending && oldest === snapshot.oldestStartedAt)
    return;

  snapshot = { pending: inFlight.size, oldestStartedAt: oldest };
  for (const listener of listeners) listener();
}

/**
 * Registers a request as in flight. Returns the function that ends it, which
 * is idempotent — a request that is retried (the 401 refresh path re-issues
 * the same config object) must not leave a phantom entry behind, because a
 * phantom entry means a wake-up notice that never goes away.
 */
export function beginApiRequest(): () => void {
  const id = ++sequence;
  inFlight.set(id, Date.now());
  publish();

  return () => {
    if (!inFlight.delete(id)) return;
    publish();
  };
}

export function subscribeApiActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getApiActivitySnapshot(): ApiActivitySnapshot {
  return snapshot;
}

/**
 * The server never renders the React tree (it only rewrites <head>), but
 * `useSyncExternalStore` still wants a server snapshot, and it must be a
 * stable reference or React warns about an infinite loop.
 */
export function getApiActivityServerSnapshot(): ApiActivitySnapshot {
  return IDLE;
}

/** Test-only: drops all tracked requests. */
export function resetApiActivity(): void {
  inFlight.clear();
  snapshot = IDLE;
  for (const listener of listeners) listener();
}
