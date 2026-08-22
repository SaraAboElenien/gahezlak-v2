import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginApiRequest,
  getApiActivitySnapshot,
  resetApiActivity,
  subscribeApiActivity,
} from "./apiActivity";

/**
 * The store behind the cold-start wake-up notice. Its one dangerous failure
 * mode is a leaked entry: an in-flight request that is never ended pins
 * `oldestStartedAt` forever, and the visitor is told the server is waking up
 * for the rest of the session.
 */

beforeEach(() => {
  resetApiActivity();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetApiActivity();
});

describe("apiActivity", () => {
  it("starts idle", () => {
    expect(getApiActivitySnapshot()).toEqual({
      pending: 0,
      oldestStartedAt: null,
    });
  });

  it("reports the oldest in-flight request, not the newest", () => {
    const first = beginApiRequest();
    const startedFirst = getApiActivitySnapshot().oldestStartedAt;

    vi.advanceTimersByTime(1000);
    beginApiRequest();

    // A second request starting must not reset the clock the notice reads —
    // otherwise a page that polls would never look slow.
    expect(getApiActivitySnapshot()).toMatchObject({
      pending: 2,
      oldestStartedAt: startedFirst,
    });

    first();
    expect(getApiActivitySnapshot().oldestStartedAt).toBe(startedFirst! + 1000);
  });

  it("returns to idle once everything has settled", () => {
    const a = beginApiRequest();
    const b = beginApiRequest();
    a();
    b();

    expect(getApiActivitySnapshot()).toEqual({
      pending: 0,
      oldestStartedAt: null,
    });
  });

  it("ignores a repeated end for the same request", () => {
    const a = beginApiRequest();
    beginApiRequest();

    a();
    a();

    // Double-ending must not decrement someone else's request into oblivion.
    expect(getApiActivitySnapshot().pending).toBe(1);
  });

  it("keeps the snapshot identity stable when nothing changed", () => {
    const before = getApiActivitySnapshot();
    // useSyncExternalStore re-renders on identity change; returning a fresh
    // object every call would render on a loop.
    expect(getApiActivitySnapshot()).toBe(before);
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeApiActivity(listener);

    const end = beginApiRequest();
    expect(listener).toHaveBeenCalledTimes(1);

    end();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    beginApiRequest();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
