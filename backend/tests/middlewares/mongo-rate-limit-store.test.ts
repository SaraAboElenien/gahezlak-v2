import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Options } from "express-rate-limit";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { MongoRateLimitStore } from "../../middlewares/mongo-rate-limit-store";
import { RateLimits } from "../../models/RateLimit";

/**
 * These run against a real in-memory MongoDB rather than a mocked model,
 * deliberately: the whole point of this store is that its counter arithmetic
 * is done atomically by the database via an aggregation-pipeline update. A
 * mock would assert that we call Mongoose, not that the concurrency behaviour
 * this store exists to provide actually holds.
 */

const WINDOW_MS = 60_000;

function makeStore(namespace = "test") {
  const store = new MongoRateLimitStore(namespace);
  store.init({ windowMs: WINDOW_MS } as Options);
  return store;
}

describe("MongoRateLimitStore", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("starts a new window at one hit and reports a reset time", async () => {
    const store = makeStore();

    const result = await store.increment("1.2.3.4");

    expect(result.totalHits).toBe(1);
    expect(result.resetTime).toBeInstanceOf(Date);
    expect(result.resetTime!.getTime()).toBeGreaterThan(Date.now());
  });

  it("counts successive hits within the same window", async () => {
    const store = makeStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");
    const third = await store.increment("1.2.3.4");

    expect(third.totalHits).toBe(3);
  });

  it("keeps the original reset time as the window advances", async () => {
    const store = makeStore();

    const first = await store.increment("1.2.3.4");
    const second = await store.increment("1.2.3.4");

    // The window must not slide forward on each hit — otherwise a client
    // sending steady traffic would never reset and never recover.
    expect(second.resetTime!.getTime()).toBe(first.resetTime!.getTime());
  });

  it("counts concurrent hits exactly, losing none", async () => {
    // This is the regression test that matters. A read-then-write store
    // undercounts here, which is precisely the pattern a brute-force attempt
    // produces — parallel requests, not sequential ones.
    const store = makeStore();

    const results = await Promise.all(
      Array.from({ length: 25 }, () => store.increment("1.2.3.4")),
    );

    const highest = Math.max(...results.map((r) => r.totalHits));
    expect(highest).toBe(25);

    // Every request must also have observed a distinct count.
    const counts = results.map((r) => r.totalHits).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("starts a fresh window once the previous one has expired", async () => {
    const store = makeStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");

    // Backdate the stored expiry rather than waiting out a real window.
    await RateLimits.updateOne(
      { _id: "test:1.2.3.4" },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const afterExpiry = await store.increment("1.2.3.4");
    expect(afterExpiry.totalHits).toBe(1);
    expect(afterExpiry.resetTime!.getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps separate counters per client key", async () => {
    const store = makeStore();

    await store.increment("1.1.1.1");
    await store.increment("1.1.1.1");
    const other = await store.increment("2.2.2.2");

    expect(other.totalHits).toBe(1);
  });

  it("keeps separate counters per limiter namespace", async () => {
    // The router-wide auth limiter and the stricter OTP limiter share one
    // collection; without namespacing they would throttle each other.
    const auth = makeStore("auth");
    const otp = makeStore("otp");

    await auth.increment("1.2.3.4");
    await auth.increment("1.2.3.4");
    const otpResult = await otp.increment("1.2.3.4");

    expect(otpResult.totalHits).toBe(1);
  });

  it("reads a current count back without incrementing it", async () => {
    const store = makeStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");

    const read = await store.get("1.2.3.4");
    expect(read?.totalHits).toBe(2);

    const readAgain = await store.get("1.2.3.4");
    expect(readAgain?.totalHits).toBe(2);
  });

  it("reports no count for an unknown key", async () => {
    const store = makeStore();
    expect(await store.get("never-seen")).toBeUndefined();
  });

  it("treats an expired window as no count when read", async () => {
    const store = makeStore();
    await store.increment("1.2.3.4");

    await RateLimits.updateOne(
      { _id: "test:1.2.3.4" },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    expect(await store.get("1.2.3.4")).toBeUndefined();
  });

  it("decrements within an open window", async () => {
    const store = makeStore();

    await store.increment("1.2.3.4");
    await store.increment("1.2.3.4");
    await store.decrement("1.2.3.4");

    expect((await store.get("1.2.3.4"))?.totalHits).toBe(1);
  });

  it("does not decrement into an already-expired window", async () => {
    const store = makeStore();
    await store.increment("1.2.3.4");

    await RateLimits.updateOne(
      { _id: "test:1.2.3.4" },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await store.decrement("1.2.3.4");

    // The stored hit count must be untouched, so the next window starts clean
    // rather than inheriting a negative offset.
    const raw = await RateLimits.findOne({ _id: "test:1.2.3.4" }).lean();
    expect(raw?.hits).toBe(1);
  });

  it("resets a single key", async () => {
    const store = makeStore();

    await store.increment("1.2.3.4");
    await store.resetKey("1.2.3.4");

    expect(await store.get("1.2.3.4")).toBeUndefined();
  });

  it("resets only its own namespace", async () => {
    const auth = makeStore("auth");
    const otp = makeStore("otp");

    await auth.increment("1.2.3.4");
    await otp.increment("1.2.3.4");

    await auth.resetAll();

    expect(await auth.get("1.2.3.4")).toBeUndefined();
    expect((await otp.get("1.2.3.4"))?.totalHits).toBe(1);
  });

  it("declares counters as shared so express-rate-limit does not warn", async () => {
    expect(makeStore().localKeys).toBe(false);
  });
});
