import { getClaudeClient, AI_CONFIG } from "../../config/claude";
import { AIMenuDataModel } from "../../models/AIMenuData";
import { MenuItemModel, IMenuItem } from "../../models/MenuItem";
import { logger } from "../../config/pino";
import { Types } from "mongoose";

/**
 * Derives allergens, dietary tags and ingredients for a menu item and stores
 * them in `ai_menu_data`.
 *
 * This is the piece that was missing. The allergy, dietary and health features
 * all read `ai_menu_data`, and the collection was empty in production — the
 * only endpoints that wrote to it were never called from the UI (the frontend
 * calls were commented out). So every allergy filter and dietary match
 * silently matched nothing, with no error to indicate why.
 *
 * The enum values below are duplicated from models/AIMenuData.ts on purpose:
 * they are the schema the model's output is constrained to, and Mongoose
 * rejects anything outside its own enum on save. Keeping them in one literal
 * list here means a mismatch shows up as a type error rather than as a
 * validation failure at runtime.
 */

const ALLERGENS = [
  "nuts",
  "peanuts",
  "tree nuts",
  "dairy",
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "soy",
  "wheat",
  "gluten",
  "sesame",
  "mustard",
  "celery",
  "lupin",
  "molluscs",
  "sulphites",
] as const;

const DIETARY_TAGS = [
  "vegan",
  "vegetarian",
  "halal",
  "kosher",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "keto",
  "low-carb",
  "high-protein",
  "low-sodium",
  "sugar-free",
  "organic",
  "raw",
] as const;

const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: { type: "string" },
    },
    allergens: {
      type: "array",
      items: { type: "string", enum: [...ALLERGENS] },
    },
    dietaryTags: {
      type: "array",
      items: { type: "string", enum: [...DIETARY_TAGS] },
    },
  },
  required: ["ingredients", "allergens", "dietaryTags"],
  additionalProperties: false,
} as const;

interface EnrichmentResult {
  ingredients: string[];
  allergens: string[];
  dietaryTags: string[];
}

const SYSTEM_PROMPT = [
  "You label restaurant menu items with their likely ingredients, allergens and dietary tags.",
  "",
  "This information is used to filter menus for people with food allergies, so err",
  "toward caution: if a dish very likely contains an allergen based on how it is",
  "normally prepared, include it. Only omit an allergen when the dish would not",
  "normally contain it at all.",
  "",
  "Only apply a dietary tag when the dish clearly qualifies. Do not tag a dish",
  "'vegan' or 'gluten-free' on the assumption that a substitution could be made.",
  "Return an empty array rather than guessing when the name and description give",
  "you too little to work with.",
].join("\n");

function describeItem(item: IMenuItem): string {
  const name = item.name?.en || item.name?.ar || "";
  const description = item.description?.en || item.description?.ar || "";
  return description ? `${name} — ${description}` : name;
}

/** Runs one Claude call for a single item. Throws on failure. */
async function analyseItem(item: IMenuItem): Promise<EnrichmentResult> {
  const response = await getClaudeClient().messages.create({
    model: AI_CONFIG.MODEL,
    max_tokens: AI_CONFIG.MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: ENRICH_SCHEMA } },
    messages: [{ role: "user", content: describeItem(item) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Declined by content safety filters");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No content returned from the model");
  }
  return JSON.parse(text.text) as EnrichmentResult;
}

/**
 * Enriches one menu item and upserts its `ai_menu_data` row.
 *
 * Upsert rather than insert so re-running after a menu edit refreshes the row
 * instead of failing on the unique `menuItemId` index.
 */
export async function enrichMenuItem(
  menuItemId: string | Types.ObjectId,
): Promise<EnrichmentResult> {
  const item = await MenuItemModel.findById(menuItemId);
  if (!item) {
    throw new Error(`Menu item ${String(menuItemId)} not found`);
  }

  const result = await analyseItem(item);

  await AIMenuDataModel.findOneAndUpdate(
    { menuItemId: item._id },
    {
      menuItemId: item._id,
      shopId: item.shopId,
      ingredients: result.ingredients,
      allergens: result.allergens,
      dietaryTags: result.dietaryTags,
      aiProcessed: true,
      lastAIUpdate: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return result;
}

export interface BulkEnrichSummary {
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{ menuItemId: string; message: string }>;
}

/**
 * Enriches every menu item in a shop.
 *
 * Deliberately sequential. These calls are not latency-sensitive (this runs
 * from a dashboard action, not a customer request), and firing a whole menu's
 * worth of requests in parallel is the reliable way to hit a rate limit and
 * fail most of them. One failure never aborts the run — the summary reports
 * what didn't work so the caller can retry just those.
 */
export async function enrichShopMenu(
  shopId: string | Types.ObjectId,
  options: { force?: boolean } = {},
): Promise<BulkEnrichSummary> {
  const items = await MenuItemModel.find({ shopId }).select("_id");
  const summary: BulkEnrichSummary = {
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const item of items) {
    if (!options.force) {
      const existing = await AIMenuDataModel.findOne({
        menuItemId: item._id,
        aiProcessed: true,
      }).select("_id");
      if (existing) {
        summary.skipped++;
        continue;
      }
    }

    try {
      // `.toString()` rather than the raw _id: MenuItem types its id as
      // mongodb's ObjectId while this signature takes mongoose's, and the two
      // are structurally different despite being the same value at runtime.
      await enrichMenuItem(item._id.toString());
      summary.processed++;
    } catch (err) {
      summary.failed++;
      summary.errors.push({
        menuItemId: item._id.toString(),
        message: (err as Error).message,
      });
      logger.error(
        { err, menuItemId: item._id.toString() },
        "Menu item enrichment failed",
      );
    }
  }

  return summary;
}
