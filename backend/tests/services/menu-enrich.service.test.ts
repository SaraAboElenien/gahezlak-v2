import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";

/**
 * Coverage for the enrichment pipeline.
 *
 * This is what populates `ai_menu_data`, the collection every allergy and
 * dietary filter reads. It was empty in production because the endpoints that
 * wrote to it were never called, so the filters silently matched nothing.
 *
 * Three behaviours here fail quietly rather than loudly if they break, which
 * is why each gets a test: upsert (not insert) so a re-run refreshes rather
 * than throwing on the unique index; skip-unless-forced so a second run over
 * a large menu doesn't re-bill every item; and per-item error isolation so one
 * bad item doesn't abandon the rest of the menu halfway through.
 */

const createMock = vi.hoisted(() => vi.fn());

vi.mock("../../config/claude", () => ({
  getClaudeClient: () => ({ messages: { create: createMock } }),
  aiEnabled: () => true,
  AI_CONFIG: { MODEL: "claude-opus-5", MAX_TOKENS: 8000 },
}));

function mockEnrichment(data: {
  ingredients?: string[];
  allergens?: string[];
  dietaryTags?: string[];
}) {
  createMock.mockResolvedValue({
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ingredients: [],
          allergens: [],
          dietaryTags: [],
          ...data,
        }),
      },
    ],
  });
}

const shopId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();

async function seedItem(name: string) {
  const { MenuItemModel } = await import("../../models/MenuItem");
  return MenuItemModel.create({
    shopId,
    categoryId,
    name: { en: name, ar: name },
    price: 50,
    isAvailable: true,
  });
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
});

describe("enrichMenuItem", () => {
  it("writes allergens, dietary tags and ingredients for an item", async () => {
    const { enrichMenuItem } =
      await import("../../services/ai/menu-enrich.service");
    const { AIMenuDataModel } = await import("../../models/AIMenuData");
    const item = await seedItem("Peanut Noodles");
    mockEnrichment({
      ingredients: ["noodles", "peanuts"],
      allergens: ["peanuts"],
      dietaryTags: ["vegetarian"],
    });

    await enrichMenuItem(item._id.toString());

    const stored = await AIMenuDataModel.findOne({ menuItemId: item._id });
    expect(stored).not.toBeNull();
    expect(stored!.allergens).toContain("peanuts");
    expect(stored!.dietaryTags).toContain("vegetarian");
    expect(stored!.aiProcessed).toBe(true);
  });

  it("refreshes an existing row rather than failing on the unique index", async () => {
    const { enrichMenuItem } =
      await import("../../services/ai/menu-enrich.service");
    const { AIMenuDataModel } = await import("../../models/AIMenuData");
    const item = await seedItem("Pasta");

    mockEnrichment({ allergens: ["gluten"] });
    await enrichMenuItem(item._id.toString());

    // Menu item edited, re-run: `menuItemId` is uniquely indexed, so an
    // insert here would throw instead of updating.
    mockEnrichment({ allergens: ["gluten", "eggs"] });
    await enrichMenuItem(item._id.toString());

    const rows = await AIMenuDataModel.find({ menuItemId: item._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].allergens).toEqual(
      expect.arrayContaining(["gluten", "eggs"]),
    );
  });

  it("constrains allergens and dietary tags to the values the schema accepts", async () => {
    const { enrichMenuItem } =
      await import("../../services/ai/menu-enrich.service");
    const item = await seedItem("Salad");
    mockEnrichment({});

    await enrichMenuItem(item._id.toString());

    // Mongoose rejects anything outside its own enum on save, so the model's
    // output has to be constrained to the same list or valid-looking results
    // fail at write time.
    const schema = createMock.mock.calls[0][0].output_config.format.schema;
    expect(schema.properties.allergens.items.enum).toContain("peanuts");
    expect(schema.properties.dietaryTags.items.enum).toContain("gluten-free");
  });

  it("throws for a menu item that does not exist", async () => {
    const { enrichMenuItem } =
      await import("../../services/ai/menu-enrich.service");

    await expect(
      enrichMenuItem(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow(/not found/i);
  });
});

describe("enrichShopMenu", () => {
  it("processes every item in the shop", async () => {
    const { enrichShopMenu } =
      await import("../../services/ai/menu-enrich.service");
    await seedItem("Item A");
    await seedItem("Item B");
    await seedItem("Item C");
    mockEnrichment({});

    const summary = await enrichShopMenu(shopId.toString());

    expect(summary.processed).toBe(3);
    expect(summary.failed).toBe(0);
  });

  it("skips already-enriched items on a second run", async () => {
    const { enrichShopMenu } =
      await import("../../services/ai/menu-enrich.service");
    await seedItem("Item A");
    await seedItem("Item B");
    mockEnrichment({});

    await enrichShopMenu(shopId.toString());
    createMock.mockClear();
    const second = await enrichShopMenu(shopId.toString());

    // Without this, re-running over a large menu re-bills every item.
    expect(second.skipped).toBe(2);
    expect(second.processed).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("re-processes everything when forced", async () => {
    const { enrichShopMenu } =
      await import("../../services/ai/menu-enrich.service");
    await seedItem("Item A");
    mockEnrichment({});

    await enrichShopMenu(shopId.toString());
    const forced = await enrichShopMenu(shopId.toString(), { force: true });

    expect(forced.processed).toBe(1);
    expect(forced.skipped).toBe(0);
  });

  it("keeps going when one item fails, and reports which", async () => {
    const { enrichShopMenu } =
      await import("../../services/ai/menu-enrich.service");
    await seedItem("Good A");
    await seedItem("Bad");
    await seedItem("Good B");

    let call = 0;
    createMock.mockImplementation(async () => {
      call++;
      if (call === 2) throw new Error("rate limited");
      return {
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ingredients: [],
              allergens: [],
              dietaryTags: [],
            }),
          },
        ],
      };
    });

    const summary = await enrichShopMenu(shopId.toString());

    // One bad item must not abandon the rest of the menu, and the caller
    // needs to know which ones to retry.
    expect(summary.processed).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toContain("rate limited");
  });

  it("does not touch menu items belonging to another shop", async () => {
    const { MenuItemModel } = await import("../../models/MenuItem");
    const { AIMenuDataModel } = await import("../../models/AIMenuData");
    const { enrichShopMenu } =
      await import("../../services/ai/menu-enrich.service");
    await seedItem("Ours");
    const otherShopId = new mongoose.Types.ObjectId();
    const theirs = await MenuItemModel.create({
      shopId: otherShopId,
      categoryId,
      name: { en: "Theirs", ar: "Theirs" },
      price: 50,
    });
    mockEnrichment({});

    const summary = await enrichShopMenu(shopId.toString());

    expect(summary.processed).toBe(1);
    expect(
      await AIMenuDataModel.findOne({ menuItemId: theirs._id }),
    ).toBeNull();
  });
});
