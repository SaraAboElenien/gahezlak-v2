import mongoose, { Schema } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface IRateLimit {
  /**
   * The limiter's own prefix plus express-rate-limit's client key (by default
   * the client IP). Prefixed so the two limiters mounted on /auth/* keep
   * separate counters for the same IP instead of sharing one.
   */
  _id: string;
  hits: number;
  expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    _id: {
      type: String,
      required: true,
    },
    hits: {
      type: Number,
      required: true,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: collectionsName.RATE_LIMITS,
    timestamps: false,
    // The store writes via aggregation-pipeline updates, which Mongoose
    // cannot cast or validate — versioning would only add write contention
    // on what is a pure counter document.
    versionKey: false,
  },
);

// Housekeeping only: Mongo's TTL monitor runs about once a minute, so an
// expired document can outlive its window by up to that long. Correctness
// does NOT depend on this — the store compares `expiresAt` against the
// current time on every increment and starts a fresh window itself. This
// index exists purely so abandoned keys don't accumulate forever.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimits = mongoose.model<IRateLimit>(
  collectionsName.RATE_LIMITS,
  RateLimitSchema,
);
