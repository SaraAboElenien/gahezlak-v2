/**
 * Cold-start pre-warm for the backend API.
 *
 * THE PROBLEM
 * -----------
 * Both halves of this app are separate Render services on the free tier, and
 * a free service is spun down after ~15 minutes with no traffic. Waking one
 * takes roughly 50 seconds. Because they sleep *independently*, the worst case
 * is serial rather than parallel:
 *
 *   visitor -> gahezlak-web is asleep         (~50s, blank screen)
 *           -> HTML finally arrives, React boots
 *           -> React calls gahezlak-api, also asleep  (~50s more)
 *
 * ~100 seconds, most of it with nothing on screen. This module turns that
 * serial wait into a parallel one: the moment the frontend process starts
 * waking, it pokes the API's `/health` so both containers come up together.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not an uptime pinger. Render allows 750 free instance-hours per workspace
 * per month and two always-on services is ~1,460 — a naive 24/7 cron would
 * get both services suspended. Everything here is demand-driven: it fires when
 * the frontend boots (which only happens when a real request woke it) and,
 * throttled, when a page that provably needs the API is requested.
 *
 * DISCIPLINE
 * ----------
 * No import-time side effects, no reads of `process.env`, everything injected.
 * `warm()` never throws and returns a promise that never rejects, so it can be
 * called and ignored without risking an unhandled rejection taking the process
 * down — this codebase has already lost an entire API to an import-time throw
 * in an optional integration (see the header of `backend/app.ts`).
 */

/** Long enough to outlast a real Render cold start (~50s) and then give up. */
export const DEFAULT_WARM_TIMEOUT_MS = 70_000;

/**
 * Render keeps a service up for ~15 minutes after its last request, so warming
 * more often than that would hold the API awake permanently and burn the
 * free instance-hour budget. Five minutes is frequent enough to cover a real
 * browsing session and far too infrequent to keep anything alive on its own.
 */
export const DEFAULT_WARM_THROTTLE_MS = 5 * 60 * 1000;

export interface ApiWarmerOptions {
  /** Backend API base, e.g. `https://gahezlak-api.onrender.com/api/v1`. */
  apiBase: string;
  /** Minimum gap between two warm-up attempts. */
  throttleMs?: number;
  /** Abort budget for a single attempt. */
  timeoutMs?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injected for tests; defaults to `console.log`. */
  log?: (message: string) => void;
}

export interface ApiWarmer {
  /**
   * Fire-and-forget. Returns a promise purely so tests can await the attempt;
   * it never rejects, and production callers should not await it.
   */
  warm(reason: string): Promise<void>;
}

/**
 * `/health` lives at the API's root, not under the `/api/v1` prefix that
 * `apiBase` carries — so derive the origin rather than appending. Returns null
 * for a relative or malformed base, which makes the whole warmer a no-op
 * instead of an error.
 */
export function healthUrlFor(apiBase: string): string | null {
  try {
    return new URL("/health", new URL(apiBase).origin).toString();
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createApiWarmer(options: ApiWarmerOptions): ApiWarmer {
  const {
    apiBase,
    throttleMs = DEFAULT_WARM_THROTTLE_MS,
    timeoutMs = DEFAULT_WARM_TIMEOUT_MS,
    now = Date.now,
    log = (message: string) => console.log(message),
  } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const healthUrl = healthUrlFor(apiBase);
  let lastAttemptAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  function warm(reason: string): Promise<void> {
    if (!healthUrl || typeof fetchImpl !== "function") {
      return Promise.resolve();
    }

    // Deduplicate rather than queue: several requests arriving during one cold
    // start should cost one wake-up call, not one each.
    if (inFlight) return inFlight;

    const startedAt = now();
    if (lastAttemptAt !== null && startedAt - lastAttemptAt < throttleMs) {
      return Promise.resolve();
    }
    // Stamped at fire time, not completion: a warm-up that hangs for the full
    // 70s must not license a burst of retries the moment it gives up.
    lastAttemptAt = startedAt;

    const attempt = (async () => {
      try {
        const response = await fetchImpl(healthUrl, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        log(
          `[warm-api] ${reason}: ${healthUrl} -> ${response.status} in ${now() - startedAt}ms`,
        );
      } catch (error) {
        // Expected and harmless: the API may be mid-boot, unreachable, or
        // simply slower than the budget. The browser will wake it the ordinary
        // way. Logged rather than thrown, and never surfaced to a visitor.
        log(
          `[warm-api] ${reason}: ${healthUrl} failed after ${now() - startedAt}ms (${describeError(error)})`,
        );
      }
    })()
      // Belt and braces — even a throwing `log` must not produce an unhandled
      // rejection in a promise nobody awaits.
      .catch(() => {})
      .finally(() => {
        inFlight = null;
      });

    inFlight = attempt;
    return attempt;
  }

  return { warm };
}
