import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { RateLimits } from "../models/RateLimit";

/**
 * An `express-rate-limit` store backed by the app's existing MongoDB
 * connection.
 *
 * Why this exists: the default `MemoryStore` keeps its counters in the
 * process's own heap. The effective limit is therefore (configured limit ×
 * number of running instances), and every restart or redeploy silently resets
 * every counter to zero. On Render both matter — a service scaled past one
 * instance multiplies the limit, and even a single instance loses its counters
 * on each deploy, which an attacker can simply wait out. For the OTP limiter
 * guarding a brute-forceable 6-digit code, that is a materially weaker control
 * than the configured numbers suggest.
 *
 * Storing counters in Mongo makes the limit hold across every instance,
 * reusing the connection the app already opens at boot — no extra service,
 * credentials, or cost (see DECISIONS.md).
 */
export class MongoRateLimitStore implements Store {
  /**
   * Counters live in one shared collection, so each limiter namespaces its
   * own keys — otherwise the router-wide auth limiter and the stricter OTP
   * limiter would increment a single counter for the same IP and throttle
   * each other.
   *
   * Named `namespace` rather than `prefix` because express-rate-limit's own
   * `Store` type declares an optional public `prefix`, which a private field
   * of the same name would clash with.
   */
  private readonly namespace: string;

  private windowMs!: number;

  /**
   * Signals to express-rate-limit that counters are shared between
   * instances, so it won't warn about double-counting.
   */
  readonly localKeys = false;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private buildKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Increments the counter and returns the current window's state.
   *
   * Uses a single aggregation-pipeline update (Mongo 4.2+) rather than a
   * read-then-write, so the "is the old window still open?" decision and the
   * increment happen atomically inside one server-side operation. A
   * read-modify-write here would let concurrent requests — exactly what a
   * brute-force attempt looks like — each read the same count and overwrite
   * one another, undercounting hits and letting attempts slip past the limit.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const _id = this.buildKey(key);
    const now = new Date();
    const freshExpiry = new Date(now.getTime() + this.windowMs);

    try {
      return await this.incrementOnce(_id, now, freshExpiry);
    } catch (error) {
      // Two concurrent requests for a key that doesn't exist yet can both
      // attempt the insert half of the upsert; the loser gets a duplicate-key
      // error. By the time we retry, the document exists, so the retry takes
      // the plain increment path. Only this specific race is retried —
      // anything else propagates so express-rate-limit's `passOnStoreError`
      // can log and decide.
      if (isDuplicateKeyError(error)) {
        return await this.incrementOnce(_id, now, freshExpiry);
      }
      throw error;
    }
  }

  private async incrementOnce(
    _id: string,
    now: Date,
    freshExpiry: Date,
  ): Promise<ClientRateLimitInfo> {
    const doc = await RateLimits.findOneAndUpdate(
      { _id },
      [
        {
          $set: {
            // Still inside the window → count up. Window elapsed (or the
            // document is being created right now, so `expiresAt` is missing
            // and the comparison is false) → start again at 1.
            hits: {
              $cond: [{ $gt: ["$expiresAt", now] }, { $add: ["$hits", 1] }, 1],
            },
            expiresAt: {
              $cond: [{ $gt: ["$expiresAt", now] }, "$expiresAt", freshExpiry],
            },
          },
        },
      ],
      { new: true, upsert: true, lean: true },
    );

    // `upsert: true` with `new: true` always yields a document, but the driver
    // types it nullable. Throwing (rather than asserting non-null) keeps this
    // honest: if it ever really is null, express-rate-limit's
    // `passOnStoreError` handles and logs it instead of a `TypeError` from
    // reading `.hits` off null.
    if (!doc) {
      throw new Error(
        "MongoRateLimitStore: upsert returned no document for key " + _id,
      );
    }

    return {
      totalHits: doc.hits,
      resetTime: doc.expiresAt,
    };
  }

  /**
   * Used by `skipSuccessfulRequests`/`skipFailedRequests`. Deliberately
   * scoped to an unexpired window: decrementing a counter whose window has
   * already rolled over would corrupt the new window's count.
   */
  async decrement(key: string): Promise<void> {
    await RateLimits.updateOne(
      { _id: this.buildKey(key), expiresAt: { $gt: new Date() } },
      { $inc: { hits: -1 } },
    );
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const doc = await RateLimits.findOne({
      _id: this.buildKey(key),
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!doc) return undefined;

    return {
      totalHits: doc.hits,
      resetTime: doc.expiresAt,
    };
  }

  async resetKey(key: string): Promise<void> {
    await RateLimits.deleteOne({ _id: this.buildKey(key) });
  }

  async resetAll(): Promise<void> {
    // Scoped to this limiter's own namespace so one limiter's reset can't
    // clear the other's counters.
    await RateLimits.deleteMany({
      _id: { $regex: `^${escapeRegex(this.namespace)}:` },
    });
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
