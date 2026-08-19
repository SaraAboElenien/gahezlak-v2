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
 * Coverage for the allergy/dietary split in menu search.
 *
 * The property under test is a safety decision, not a formatting one: an item
 * with no enrichment data is classified **unsafe**, never safe. Calling a dish
 * allergen-free when nothing is known about it is the one failure mode here
 * that could actually harm someone, and it is also what makes an unenriched
 * menu visible — before this, `ai_menu_data` was empty in production and the
 * allergy filter silently matched nothing with no error to explain why.
 *
 * The Claude call is mocked throughout: what matters is how the parsed
 * criteria are applied to the menu, not the model's parsing.
 */

const createMock = vi.hoisted(() => vi.fn());

vi.mock("../../config/claude", () => ({
  getClaudeClient: () => ({ messages: { create: createMock } }),
  aiEnabled: () => true,
  AI_CONFIG: {
    MODEL: "claude-opus-5",
    ENRICH_MODEL: "claude-opus-5",
    MAX_TOKENS: 8000,
    EFFORT: "low",
  },
  outputConfig: (schema: unknown) => ({
    effort: "low",
    format: { type: "json_schema", schema },
  }),
}));

/** Shapes a fake Claude reply carrying structured search criteria. */
function mockCriteria(criteria: {
  keywords?: string[];
  avoidAllergens?: string[];
  requireDietaryTags?: string[];
  maxPrice?: number;
  minPrice?: number;
}) {
  createMock.mockResolvedValue({
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          keywords: [],
          avoidAllergens: [],
          requireDietaryTags: [],
          ...criteria,
        }),
      },
    ],
  });
}

const shopId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();

async function seedItem(name: string, price = 50) {
  const { MenuItemModel } = await import("../../models/MenuItem");
  return MenuItemModel.create({
    shopId,
    categoryId,
    name: { en: name, ar: name },
    price,
    isAvailable: true,
  });
}

async function seedEnrichment(
  menuItemId: mongoose.Types.ObjectId | unknown,
  data: { allergens?: string[]; dietaryTags?: string[] },
) {
  const { AIMenuDataModel } = await import("../../models/AIMenuData");
  return AIMenuDataModel.create({
    menuItemId,
    shopId,
    ingredients: [],
    allergens: data.allergens ?? [],
    dietaryTags: data.dietaryTags ?? [],
    aiProcessed: true,
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

describe("searchMenu — allergy and dietary split", () => {
  it("treats an item with no enrichment data as unsafe, never safe", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("Mystery Stew"); // deliberately not enriched
    mockCriteria({ avoidAllergens: ["peanuts"] });

    const result = await searchMenu({ query: "no peanuts please", shopId });

    // The whole point: unknown must never be reported as safe.
    expect(result.safeItems).toHaveLength(0);
    expect(result.unsafeItems).toHaveLength(1);
    expect(result.unsafeItems[0].name.en).toBe("Mystery Stew");
  });

  it("separates items by the allergen the customer asked to avoid", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    const safe = await seedItem("Grilled Chicken");
    const unsafe = await seedItem("Peanut Noodles");
    await seedEnrichment(safe._id, { allergens: [] });
    await seedEnrichment(unsafe._id, { allergens: ["peanuts"] });

    mockCriteria({ avoidAllergens: ["peanuts"] });
    const result = await searchMenu({ query: "peanut allergy", shopId });

    expect(result.safeItems.map((i) => i.name.en)).toEqual(["Grilled Chicken"]);
    expect(result.unsafeItems.map((i) => i.name.en)).toEqual([
      "Peanut Noodles",
    ]);
  });

  it("requires every requested dietary tag, not just one of them", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    const both = await seedItem("Vegan GF Salad");
    const partial = await seedItem("Vegan Pasta");
    await seedEnrichment(both._id, { dietaryTags: ["vegan", "gluten-free"] });
    await seedEnrichment(partial._id, { dietaryTags: ["vegan"] });

    mockCriteria({ requireDietaryTags: ["vegan", "gluten-free"] });
    const result = await searchMenu({ query: "vegan and gluten free", shopId });

    expect(result.safeItems.map((i) => i.name.en)).toEqual(["Vegan GF Salad"]);
    expect(result.unsafeItems.map((i) => i.name.en)).toEqual(["Vegan Pasta"]);
  });

  it("returns everything as a plain result when no restriction was expressed", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("Grilled Chicken");
    await seedItem("Peanut Noodles");
    mockCriteria({ keywords: [] });

    const result = await searchMenu({ query: "something tasty", shopId });

    // With no restriction there is nothing to be unsafe *about*, so unenriched
    // items must not be pushed into unsafeItems here.
    expect(result.safeItems).toHaveLength(2);
    expect(result.unsafeItems).toHaveLength(0);
  });

  it("applies a price ceiling parsed from the query", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("Cheap Wrap", 30);
    await seedItem("Expensive Steak", 200);
    mockCriteria({ maxPrice: 60 });

    const result = await searchMenu({ query: "something cheap", shopId });

    const names = [...result.safeItems, ...result.unsafeItems].map(
      (i) => i.name.en,
    );
    expect(names).toEqual(["Cheap Wrap"]);
  });

  it("excludes unavailable items unless explicitly asked for", async () => {
    const { MenuItemModel } = await import("../../models/MenuItem");
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("In Stock");
    await MenuItemModel.create({
      shopId,
      categoryId,
      name: { en: "Sold Out", ar: "Sold Out" },
      price: 40,
      isAvailable: false,
    });
    mockCriteria({});

    const hidden = await searchMenu({ query: "food", shopId });
    expect(
      [...hidden.safeItems, ...hidden.unsafeItems].map((i) => i.name.en),
    ).toEqual(["In Stock"]);

    const shown = await searchMenu({
      query: "food",
      shopId,
      includeOutOfStock: true,
    });
    expect([...shown.safeItems, ...shown.unsafeItems]).toHaveLength(2);
  });
});

describe("searchMenu — degradation when the model is unavailable", () => {
  it("falls back to a keyword search instead of failing the request", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("Grilled Chicken");
    await seedItem("Beef Burger");
    createMock.mockRejectedValue(new Error("API unreachable"));

    const result = await searchMenu({ query: "chicken", shopId });

    // A customer trying to find food should still get results when the AI
    // call is down — losing query understanding is acceptable, losing the
    // menu is not.
    const names = [...result.safeItems, ...result.unsafeItems].map(
      (i) => i.name.en,
    );
    expect(names).toContain("Grilled Chicken");
    expect(names).not.toContain("Beef Burger");
  });

  it("does not escape into a broken regex on punctuation in the query", async () => {
    const { searchMenu } =
      await import("../../services/ai/menu-search.service");
    await seedItem("Grilled Chicken");
    createMock.mockRejectedValue(new Error("API unreachable"));

    // Unescaped, "(" would throw and "*" would become an unintended pattern —
    // and this path takes the raw query straight from a public request body.
    await expect(
      searchMenu({ query: "chicken (spicy) *", shopId }),
    ).resolves.toBeDefined();
  });
});

describe("dropRedundantDietaryTags", () => {
  /**
   * A guard against the model mirroring an avoidance into the matching tag.
   *
   * Enrichment lists allergens exhaustively but applies tags conservatively,
   * so requiring `gluten-free` *and* excluding `gluten` matches almost nothing
   * while the exclusion alone works fine. The system prompt asks for this and
   * English queries comply — but a real Arabic query ("شيء نباتي بدون جلوتين",
   * "something vegetarian without gluten") came back with both and returned 0
   * of 30 items. This app is bilingual, so prompt compliance in one language
   * is not coverage.
   */
  it("drops a dietary tag that only restates an excluded allergen", async () => {
    const { dropRedundantDietaryTags } =
      await import("../../services/ai/menu-search.service");

    const out = dropRedundantDietaryTags({
      keywords: [],
      avoidAllergens: ["gluten"],
      requireDietaryTags: ["vegetarian", "gluten-free"],
    });

    expect(out.requireDietaryTags).toEqual(["vegetarian"]);
    // The allergen exclusion has to survive — it is what does the filtering.
    expect(out.avoidAllergens).toEqual(["gluten"]);
  });

  it("matches an allergen synonym, not just the exact word", async () => {
    const { dropRedundantDietaryTags } =
      await import("../../services/ai/menu-search.service");

    // "wheat" and "gluten" are separate enum values that mean the same thing
    // to a customer avoiding bread, and the model uses them interchangeably.
    expect(
      dropRedundantDietaryTags({
        keywords: [],
        avoidAllergens: ["wheat"],
        requireDietaryTags: ["gluten-free"],
      }).requireDietaryTags,
    ).toEqual([]);

    expect(
      dropRedundantDietaryTags({
        keywords: [],
        avoidAllergens: ["milk"],
        requireDietaryTags: ["dairy-free"],
      }).requireDietaryTags,
    ).toEqual([]);
  });

  it("keeps a genuine diet request untouched", async () => {
    const { dropRedundantDietaryTags } =
      await import("../../services/ai/menu-search.service");

    // The other direction. A guard that stripped every tag would pass the
    // tests above on its own and quietly break every "I'm vegan" search.
    const out = dropRedundantDietaryTags({
      keywords: [],
      avoidAllergens: ["shellfish"],
      requireDietaryTags: ["vegan", "keto"],
    });

    expect(out.requireDietaryTags).toEqual(["vegan", "keto"]);
  });

  it("keeps a -free tag when the matching allergen is not excluded", async () => {
    const { dropRedundantDietaryTags } =
      await import("../../services/ai/menu-search.service");

    // "I want something labelled gluten-free" is a legitimate request on its
    // own; only the *pair* is redundant.
    expect(
      dropRedundantDietaryTags({
        keywords: [],
        avoidAllergens: [],
        requireDietaryTags: ["gluten-free"],
      }).requireDietaryTags,
    ).toEqual(["gluten-free"]);
  });
});
