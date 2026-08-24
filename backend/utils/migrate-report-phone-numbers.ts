/**
 * One-time repair for reports written before `models/Report.ts`'s
 * `phoneNumber` field changed from Number to String (see TECH_DEBT.md's
 * "Report phone numbers are stored as numbers" entry).
 *
 * Mongoose casts on write, so a submitted Egyptian mobile number like
 * "01012345678" was silently persisted as the number 1012345678 — the
 * leading zero was never written to the database, not just dropped in
 * display. Recovery is exact because Egyptian mobile numbers are a fixed
 * 11 digits and the only digit a Number cast can lose is that leading zero:
 * zero-pad every affected value back out to 11 digits.
 *
 * Safety / idempotency:
 *   - Reads and writes through the RAW driver collection, not the `Report`
 *     Mongoose model. This is deliberate: once the schema is String, the
 *     model would cast a still-broken stored number to a string *on read*
 *     (e.g. 1012345678 -> "1012345678"), which would hide exactly the rows
 *     this migration needs to find and would defeat a `$type` query run
 *     through it.
 *   - Only touches documents whose `phoneNumber` is still BSON type
 *     "number". A row already stored as a string — whether it was always
 *     correct or was already fixed by an earlier run of this script — is
 *     never re-examined, so re-running finds nothing left to do.
 *   - `padPhoneNumber` is a no-op for a value already at or above the
 *     target length, so it cannot double-pad a value it (or a previous run)
 *     already fixed.
 *
 * Usage (dry run is the default — nothing is written unless you opt in):
 *   npm run migrate:report-phones:dev              # dry run
 *   npm run migrate:report-phones:dev -- --apply   # writes changes
 *   npm run migrate:report-phones:prod -- --apply  # writes changes, prod env
 *
 * DO NOT run this against production without reading the dry-run output
 * first. It was written and unit-tested but deliberately never executed
 * against any real database as part of writing it.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { collectionsName } from "../common/collections-name";

export const EGYPTIAN_MOBILE_LENGTH = 11;

/**
 * Pure padding logic — unit-tested in isolation from Mongo.
 *
 * Recovers the leading zero(s) lost when "01012345678" was cast to the
 * number 1012345678. A value already at or above `targetLength` digits is
 * returned unchanged (as a string), which is what makes applying this
 * function twice to the same row safe.
 */
export function padPhoneNumber(
  value: number,
  targetLength: number = EGYPTIAN_MOBILE_LENGTH,
): string {
  return String(value).padStart(targetLength, "0");
}

interface RawReportDoc {
  _id: mongoose.Types.ObjectId;
  phoneNumber: unknown;
}

export async function migrateReportPhoneNumbers(apply: boolean) {
  const collection = mongoose.connection.collection<RawReportDoc>(
    collectionsName.REPORT,
  );

  // Read every report and filter by JS `typeof` rather than a driver-level
  // `$type` query. Mongoose's `Number` schema type can serialize to more than
  // one BSON numeric subtype (double, int32, ...) depending on the value and
  // driver version, and the mongodb driver's own TS types only accept a
  // single `BSONTypeAlias`, not the array the server would otherwise accept
  // to match them all. Filtering after the fact is simpler and covers every
  // numeric subtype without needing to know which one Mongoose used. This is
  // still the raw driver collection rather than the `Report` model — once the
  // schema is String, the model would cast a still-broken stored number to a
  // string *on read* (e.g. 1012345678 -> "1012345678"), which would hide
  // exactly the rows this migration needs to find.
  const all = await collection.find({}).toArray();
  const candidates = all.filter(
    (doc): doc is RawReportDoc & { phoneNumber: number } =>
      typeof doc.phoneNumber === "number",
  );

  console.log(
    `[migrate-report-phone-numbers] found ${candidates.length} report(s) with a numeric phoneNumber.`,
  );

  for (const doc of candidates) {
    const before = doc.phoneNumber;
    const after = padPhoneNumber(before);
    console.log(
      `  ${doc._id.toString()}: ${before} -> ${after}${
        apply ? "" : " (dry run, not written)"
      }`,
    );

    if (apply) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { phoneNumber: after } },
      );
    }
  }

  if (apply) {
    console.log(
      `[migrate-report-phone-numbers] Updated ${candidates.length} report(s).`,
    );
  } else {
    console.log(
      "[migrate-report-phone-numbers] Dry run only — no changes written. Re-run with --apply to write changes.",
    );
  }

  return candidates.length;
}

async function run() {
  const apply = process.argv.includes("--apply");

  await connectDB();
  try {
    await migrateReportPhoneNumbers(apply);
  } finally {
    await mongoose.connection.close();
  }
}

// Guards the side-effecting entrypoint so this module can be `import`ed by a
// test for `padPhoneNumber`/`migrateReportPhoneNumbers` without opening a
// database connection or reading `process.argv` as a side effect of import —
// the same reasoning `config/db.ts` documents for keeping `connectDB` itself
// free of a `process.exit`.
if (require.main === module) {
  run().catch((err) => {
    console.error("[migrate-report-phone-numbers] failed:", err);
    process.exit(1);
  });
}
