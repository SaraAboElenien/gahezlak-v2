import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import QRCode from "qrcode";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Shops } from "../../models/Shop";

/**
 * `GET /api/v1/shops/name/:shopName/qr-code.png` — the on-demand replacement
 * for the old imgbb-hosted QR flow.
 *
 * Two production incidents motivate this endpoint and this file:
 *
 *   1. imgbb started refusing requests from the deployed host's datacenter IP
 *      range, so `createShopHandler`'s QR upload — and therefore shop
 *      creation itself — was completely broken in production.
 *   2. The previously-uploaded image had independently gone 404, so even a
 *      shop created before that started failing showed a broken image.
 *
 * A QR code is a pure function of the menu URL it encodes, so this endpoint
 * renders it fresh on every request instead of storing anything — which also
 * closes the older, third bug: the URL used to be baked in once, at creation
 * time, from whatever `FRONTEND_URL` held at that moment. What's asserted
 * here is the full boundary: real PNG bytes out, the correct URL encoded
 * inside them, a 404 for an unknown shop, the rate limiter actually attached,
 * and — the regression this whole change exists to prevent — that the
 * encoded URL reflects `FRONTEND_URL` as read *right now*, not a value
 * captured at some earlier point.
 */

process.env.JWT_SECRET ??= "test-jwt-secret";

async function buildApp() {
  const { default: shopRoutes } = await import("../../routes/shop.routes");
  const { ErrorHandlerMiddleware } =
    await import("../../middlewares/error-handling.middleware");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/shops", shopRoutes);
  app.use(ErrorHandlerMiddleware);
  return app;
}

function pngMagicNumber(buf: Buffer) {
  return buf.subarray(0, 8);
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function seedShop(name: string) {
  return Shops.create({
    name,
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: `${name.replace(/[^a-z0-9]/gi, "").toLowerCase()}@example.com`,
    ownerId: new (await import("mongoose")).default.Types.ObjectId(),
  });
}

beforeAll(async () => {
  // The rate limiter's store is MongoDB-backed, so it needs a live connection,
  // same as the shop itself.
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("GET /shops/name/:shopName/qr-code.png", () => {
  it("returns a real PNG for an existing shop", async () => {
    await seedShop("Fauget");
    const app = await buildApp();

    const res = await request(app).get("/api/v1/shops/name/Fauget/qr-code.png");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/png/);
    expect(pngMagicNumber(res.body as Buffer)).toEqual(PNG_MAGIC);
  });

  it("sets cache headers that let a shared cache absorb repeat hits without pinning a stale image", async () => {
    await seedShop("Fauget");
    const app = await buildApp();

    const res = await request(app).get("/api/v1/shops/name/Fauget/qr-code.png");

    // `max-age=0` — a browser must revalidate rather than hold its own copy
    // forever; `s-maxage=3600` — a shared/CDN cache may still serve repeat
    // hits for an hour, which matters because the route is public and would
    // otherwise pay for a fresh PNG encode on every single request.
    expect(res.headers["cache-control"]).toContain("max-age=0");
    expect(res.headers["cache-control"]).toContain("s-maxage=3600");
  });

  it("404s for a shop that does not exist", async () => {
    const app = await buildApp();

    const res = await request(app).get(
      "/api/v1/shops/name/No%20Such%20Shop/qr-code.png",
    );

    expect(res.status).toBe(404);
  });

  it("percent-encodes a shop name with punctuation, so the encoded URL cannot be truncated", async () => {
    const shopName = "Joe's Diner #2";
    await seedShop(shopName);
    process.env.FRONTEND_URL = "https://example.test";
    const app = await buildApp();

    const res = await request(app).get(
      `/api/v1/shops/name/${encodeURIComponent(shopName)}/qr-code.png`,
    );

    expect(res.status).toBe(200);

    // Compare against bytes generated the same way, directly with the same
    // library, rather than trying to decode the response PNG back into text
    // — the most direct way to pin "the correctly-encoded URL was what got
    // rendered" without reimplementing a QR decoder.
    const expectedUrl = `https://example.test/shops/${encodeURIComponent(shopName)}/menu`;
    const expected = await QRCode.toBuffer(expectedUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });

    expect(res.body as Buffer).toEqual(expected);
  });

  /**
   * THE regression this whole change exists to prevent. The old flow baked
   * the menu URL in once, at shop-creation time; this endpoint must instead
   * reflect `FRONTEND_URL` as it is *right now*, on every single request —
   * with no server restart, no shop update, nothing but the env var changing
   * underneath a long-running process (exactly what a redeploy does).
   */
  it("reflects the CURRENT FRONTEND_URL, not a value captured earlier", async () => {
    await seedShop("Fauget");
    const app = await buildApp();

    process.env.FRONTEND_URL = "http://localhost:5173";
    const stale = (
      await request(app).get("/api/v1/shops/name/Fauget/qr-code.png")
    ).body as Buffer;

    process.env.FRONTEND_URL = "https://gahezlak-web.onrender.com";
    const fresh = (
      await request(app).get("/api/v1/shops/name/Fauget/qr-code.png")
    ).body as Buffer;

    // Both are valid PNGs encoding different URLs, so their bytes differ.
    expect(fresh.equals(stale)).toBe(false);

    const expectedFresh = await QRCode.toBuffer(
      "https://gahezlak-web.onrender.com/shops/Fauget/menu",
      {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
      },
    );
    expect(fresh).toEqual(expectedFresh);
  });
});

describe("GET /shops/name/:shopName/qr-code.png — rate limiting", () => {
  it("cuts off a burst of requests from the same caller", async () => {
    await seedShop("Fauget");
    const app = await buildApp();

    const statuses: number[] = [];
    // The limiter is 60 per 5 minutes; 65 requests in one burst must produce
    // at least one refusal.
    for (let i = 0; i < 65; i++) {
      const res = await request(app).get(
        "/api/v1/shops/name/Fauget/qr-code.png",
      );
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  }, 30000);
});
