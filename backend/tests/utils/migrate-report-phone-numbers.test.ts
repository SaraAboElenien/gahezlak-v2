import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { Role } from "../../models/Role";
import { collectionsName } from "../../common/collections-name";
import {
  padPhoneNumber,
  migrateReportPhoneNumbers,
} from "../../utils/migrate-report-phone-numbers";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Covers `utils/migrate-report-phone-numbers.ts`, written to repair reports
 * written while `models/Report.ts` typed `phoneNumber` as Number (see
 * TECH_DEBT.md's "Report phone numbers are stored as numbers" entry).
 * Mongoose cast "01012345678" to the number 1012345678 on write, silently
 * dropping the leading zero from the database, not just from display.
 */

describe("padPhoneNumber", () => {
  it("restores the leading zero lost when a number is cast", () => {
    expect(padPhoneNumber(1012345678)).toBe("01012345678");
  });

  it("pads more than one lost leading zero if that many were lost", () => {
    expect(padPhoneNumber(112345678)).toBe("00112345678");
  });

  it("is a no-op for a value already at the target length", () => {
    // Guards idempotency: applying this to an 11-digit value a second time
    // (e.g. a row this script already fixed) must not add another zero.
    expect(padPhoneNumber(1012345678, 11)).toHaveLength(11);
    expect(padPhoneNumber(Number("01012345678"))).toBe("01012345678");
  });

  it("does not truncate a value already longer than the target length", () => {
    expect(padPhoneNumber(123456789012, 11)).toBe("123456789012");
  });
});

describe("migrateReportPhoneNumbers", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  /**
   * Inserts through the raw driver collection, bypassing the (now-String)
   * `Report` model schema entirely, so the document is stored with a real
   * BSON number — exactly the shape a row written under the old Number
   * schema would have. Using `Report.create` here would not reproduce the
   * bug: the model would cast the input to a string before it ever reached
   * the database.
   */
  async function insertRawReport(phoneNumber: number) {
    const collection = mongoose.connection.collection(collectionsName.REPORT);
    const { insertedId } = await collection.insertOne({
      receiver: Role.SHOP_OWNER,
      message: "The order arrived cold and late.",
      phoneNumber,
    });
    return insertedId;
  }

  it("zero-pads a numeric phoneNumber back to a full Egyptian mobile number", async () => {
    const id = await insertRawReport(1012345678);

    const updated = await migrateReportPhoneNumbers(true);

    expect(updated).toBe(1);
    const stored = await mongoose.connection
      .collection(collectionsName.REPORT)
      .findOne({ _id: id });
    expect(stored?.phoneNumber).toBe("01012345678");
    expect(typeof stored?.phoneNumber).toBe("string");
  });

  it("dry run reports what it would change without writing anything", async () => {
    const id = await insertRawReport(1012345678);

    const wouldUpdate = await migrateReportPhoneNumbers(false);

    expect(wouldUpdate).toBe(1);
    const stored = await mongoose.connection
      .collection(collectionsName.REPORT)
      .findOne({ _id: id });
    // Unchanged: still the raw number, not the padded string.
    expect(stored?.phoneNumber).toBe(1012345678);
    expect(typeof stored?.phoneNumber).toBe("number");
  });

  it("leaves a report already stored as a correct string untouched", async () => {
    const collection = mongoose.connection.collection(collectionsName.REPORT);
    const { insertedId } = await collection.insertOne({
      receiver: Role.SHOP_OWNER,
      message: "The order arrived cold and late.",
      phoneNumber: "01012345678",
    });

    const updated = await migrateReportPhoneNumbers(true);

    expect(updated).toBe(0);
    const stored = await collection.findOne({ _id: insertedId });
    expect(stored?.phoneNumber).toBe("01012345678");
  });

  it("is idempotent: running it twice does not double-pad an already-fixed row", async () => {
    await insertRawReport(1012345678);

    await migrateReportPhoneNumbers(true);
    const secondPassUpdated = await migrateReportPhoneNumbers(true);

    expect(secondPassUpdated).toBe(0);
    const stored = await mongoose.connection
      .collection(collectionsName.REPORT)
      .findOne({});
    expect(stored?.phoneNumber).toBe("01012345678");
  });

  it("does nothing when there are no reports at all", async () => {
    const updated = await migrateReportPhoneNumbers(true);

    expect(updated).toBe(0);
  });
});
