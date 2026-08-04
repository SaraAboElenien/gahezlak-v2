import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { generateOrderNumber } from "../../utils/generate-order-number";
import { Counters } from "../../models/Counter";

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

describe("generateOrderNumber", () => {
  it("increments sequentially for the same shop", async () => {
    const shopId = new mongoose.Types.ObjectId().toString();

    const first = await generateOrderNumber(shopId);
    const second = await generateOrderNumber(shopId);
    const third = await generateOrderNumber(shopId);

    // Same shop -> same shopNumber prefix, sequence increments by 1 each call
    expect(second - first).toBe(1);
    expect(third - second).toBe(1);
  });

  it("keeps independent sequences per shop", async () => {
    const shopIdA = new mongoose.Types.ObjectId().toString();
    const shopIdB = new mongoose.Types.ObjectId().toString();

    await generateOrderNumber(shopIdA);
    await generateOrderNumber(shopIdA);
    const counterA = await Counters.findById(`order_seq_${shopIdA}`);

    await generateOrderNumber(shopIdB);
    const counterB = await Counters.findById(`order_seq_${shopIdB}`);

    expect(counterA?.sequence_value).toBe(2);
    expect(counterB?.sequence_value).toBe(1);
  });

  it("derives the shop-number prefix deterministically from the shop id", async () => {
    const shopId = new mongoose.Types.ObjectId().toString();
    const expectedShopNumber = (parseInt(shopId.slice(-3), 16) % 900) + 100;

    const orderNumber = await generateOrderNumber(shopId);

    expect(orderNumber).toBe(expectedShopNumber * 1000 + 1);
  });
});
