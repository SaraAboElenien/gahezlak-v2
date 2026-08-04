import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Security coverage for the AI routes.
 *
 * These are the only endpoints in the app where one request spends money on a
 * third-party account, and `/super-search` is public by necessity — customers
 * browsing a menu are not logged in. Before this, the router was mounted with
 * no rate limiter at all and its search routes sat *before* the auth
 * middleware, so anyone on the internet could POST unlimited prompts and drain
 * the account.
 *
 * What's asserted here is the boundary, not the AI: that the limiter is
 * actually attached, that the write routes reject anonymous callers, and that
 * an unbounded query can't be forwarded to the model verbatim.
 */

process.env.JWT_SECRET ??= "test-jwt-secret";

const searchMenuMock = vi.hoisted(() => vi.fn());
const enrichMenuItemMock = vi.hoisted(() => vi.fn());
const enrichShopMenuMock = vi.hoisted(() => vi.fn());

vi.mock("../../services/ai/menu-search.service", () => ({
  searchMenu: searchMenuMock,
}));
vi.mock("../../services/ai/menu-enrich.service", () => ({
  enrichMenuItem: enrichMenuItemMock,
  enrichShopMenu: enrichShopMenuMock,
}));

async function buildApp() {
  const { aiMenuRoutes } = await import("../../routes/ai-menu.routes");
  const { ErrorHandlerMiddleware } =
    await import("../../middlewares/error-handling.middleware");
  const app = express();
  app.use(express.json());
  app.use("/api/v1/ai/menu", aiMenuRoutes);
  app.use(ErrorHandlerMiddleware);
  return app;
}

beforeAll(async () => {
  // The rate limiter's store is MongoDB-backed, so it needs a live connection.
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  // A key must be present or every route short-circuits on "not configured"
  // before reaching the behaviour under test.
  process.env.ANTHROPIC_API_KEY = "test-key";
  searchMenuMock.mockResolvedValue({
    safeItems: [],
    unsafeItems: [],
    criteria: { keywords: [], avoidAllergens: [], requireDietaryTags: [] },
  });
});

describe("AI routes — authentication boundary", () => {
  it("rejects anonymous menu OCR", async () => {
    const app = await buildApp();

    const res = await request(app).post("/api/v1/ai/menu/vision-extract");

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects anonymous single-item enrichment, and never calls the model", async () => {
    const app = await buildApp();

    const res = await request(app).post("/api/v1/ai/menu/enrich/abc123");

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(enrichMenuItemMock).not.toHaveBeenCalled();
  });

  it("rejects anonymous bulk enrichment, and never calls the model", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/ai/menu/enrich-all")
      .send({ shopId: "507f1f77bcf86cd799439011" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // The expensive one: bulk enrichment is a call per menu item.
    expect(enrichShopMenuMock).not.toHaveBeenCalled();
  });

  it("allows anonymous search — it is public by design", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/ai/menu/super-search")
      .send({ query: "something spicy", shopId: "507f1f77bcf86cd799439011" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("safeItems");
    expect(res.body.data).toHaveProperty("unsafeItems");
  });
});

describe("AI routes — rate limiting", () => {
  it("cuts off the public search endpoint once the window limit is hit", async () => {
    const app = await buildApp();
    const send = () =>
      request(app)
        .post("/api/v1/ai/menu/super-search")
        .send({ query: "chicken", shopId: "507f1f77bcf86cd799439011" });

    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await send()).status);
    }

    // The limiter is 15 per 5 minutes; the tail of a 20-request burst must be
    // refused. Asserted as "some were refused" rather than an exact cutoff so
    // the test tracks the boundary existing, not one specific number.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 200).length).toBeLessThan(20);
  });

  it("stops calling the model once requests are being refused", async () => {
    const app = await buildApp();
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post("/api/v1/ai/menu/super-search")
        .send({ query: "chicken", shopId: "507f1f77bcf86cd799439011" });
    }

    // The whole point: a refused request must not reach the paid API.
    expect(searchMenuMock.mock.calls.length).toBeLessThan(20);
  });
});

describe("AI routes — input bounds", () => {
  it("truncates an oversized query before it reaches the model", async () => {
    const app = await buildApp();

    await request(app)
      .post("/api/v1/ai/menu/super-search")
      .send({ query: "x".repeat(5000), shopId: "507f1f77bcf86cd799439011" });

    expect(searchMenuMock).toHaveBeenCalled();
    const { query } = searchMenuMock.mock.calls[0][0];
    expect(query.length).toBeLessThanOrEqual(500);
  });

  it("caps the requested result limit", async () => {
    const app = await buildApp();

    await request(app).post("/api/v1/ai/menu/super-search").send({
      query: "chicken",
      shopId: "507f1f77bcf86cd799439011",
      limit: 100000,
    });

    const { limit } = searchMenuMock.mock.calls[0][0];
    expect(limit).toBeLessThanOrEqual(50);
  });

  it("rejects an empty query without calling the model", async () => {
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/ai/menu/super-search")
      .send({ query: "   ", shopId: "507f1f77bcf86cd799439011" });

    expect(res.status).toBe(400);
    expect(searchMenuMock).not.toHaveBeenCalled();
  });

  it("returns a clear error when no API key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const app = await buildApp();

    const res = await request(app)
      .post("/api/v1/ai/menu/super-search")
      .send({ query: "chicken", shopId: "507f1f77bcf86cd799439011" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(searchMenuMock).not.toHaveBeenCalled();
  });
});
