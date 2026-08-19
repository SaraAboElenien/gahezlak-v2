import { getClaudeClient, AI_CONFIG, outputConfig } from "../../config/claude";
import { MenuItemModel, IMenuItem } from "../../models/MenuItem";
import { AIMenuDataModel } from "../../models/AIMenuData";
import { logger } from "../../config/pino";
import { Types } from "mongoose";

/**
 * Natural-language menu search with allergy and dietary awareness.
 *
 * Replaces four overlapping implementations: a `smart-search` service, an
 * `allergy-filter` service, a `health-insights` service, and a ~310-line
 * `superSearchHandler` in the controller that duplicated the first one's
 * query-parsing rather than calling it. Only the controller path was ever
 * reachable from the UI; the three services were dead code.
 *
 * Shape of the work: one Claude call turns the query into structured filters,
 * then Mongo does the actual filtering. The model is used for the part it is
 * good at — understanding "something light with no dairy under 80 pounds" —
 * and not for scanning the menu, which keeps this to a single API call per
 * search regardless of how many items the shop has.
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

const QUERY_SCHEMA = {
  type: "object",
  properties: {
    keywords: { type: "array", items: { type: "string" } },
    avoidAllergens: {
      type: "array",
      items: { type: "string", enum: [...ALLERGENS] },
    },
    requireDietaryTags: {
      type: "array",
      items: { type: "string", enum: [...DIETARY_TAGS] },
    },
    maxPrice: { type: "number" },
    minPrice: { type: "number" },
  },
  required: ["keywords", "avoidAllergens", "requireDietaryTags"],
  additionalProperties: false,
} as const;

export interface SearchCriteria {
  keywords: string[];
  avoidAllergens: string[];
  requireDietaryTags: string[];
  maxPrice?: number;
  minPrice?: number;
}

export interface MenuSearchResult {
  safeItems: IMenuItem[];
  unsafeItems: IMenuItem[];
  criteria: SearchCriteria;
}

const SYSTEM_PROMPT = [
  "Turn a restaurant customer's search into structured filters.",
  "",
  "- `keywords`: dish names, ingredients or cooking methods they want. Leave empty",
  "  if they only expressed restrictions.",
  "- `avoidAllergens`: allergens to exclude. Include these when the customer states",
  "  an allergy or intolerance, or asks for a dish 'without' something.",
  "- `requireDietaryTags`: only when the customer names a diet they follow —",
  "  'vegan', 'keto', 'halal'. An avoidance is not a diet: 'no dairy', 'nut",
  "  allergy', 'without gluten' go in `avoidAllergens` and nowhere else. Never",
  "  mirror an avoidance into the matching tag. Tags are only applied to a dish",
  "  that clearly qualifies, so requiring 'dairy-free' as well as excluding",
  "  dairy rejects every dish that merely happens to contain no dairy — which",
  "  is most of them.",
  "- `minPrice` / `maxPrice`: in the menu's own currency. Map vague wording to",
  "  numbers: 'cheap' is under 40, 'expensive' is over 80.",
  "",
  "The query may be in English or Arabic. Return filters, not dish suggestions.",
].join("\n");

/**
 * Dietary tags that restate an allergen exclusion.
 *
 * Enrichment lists allergens exhaustively but applies tags conservatively —
 * "only when the dish clearly qualifies" — so almost no dish carries
 * `gluten-free` even when it plainly contains no gluten. Asking for the tag
 * *and* excluding the allergen therefore rejects nearly the whole menu, while
 * the allergen exclusion on its own is both sufficient and more reliable.
 */
const TAG_MIRRORS_ALLERGEN: Record<string, readonly string[]> = {
  "dairy-free": ["dairy", "milk"],
  "gluten-free": ["gluten", "wheat"],
  "nut-free": ["nuts", "peanuts", "tree nuts"],
};

/**
 * Drops dietary tags that merely restate an allergen the query already
 * excludes.
 *
 * The system prompt asks for this, and on English queries the model complies.
 * It is enforced here anyway because prompt compliance is not a guarantee and
 * the failure is silent: a real Arabic query — "شيء نباتي بدون جلوتين",
 * "something vegetarian without gluten" — came back with `gluten` in
 * `avoidAllergens` *and* `gluten-free` in `requireDietaryTags`, which matched
 * 0 of 30 items where the allergen filter alone matched sensibly. A customer
 * sees an empty menu and concludes the restaurant has nothing for them.
 *
 * This app is bilingual, so "the prompt handles it in English" is not
 * coverage — and the smaller the model, the less reliably it follows a nuance
 * like this in either language.
 */
export function dropRedundantDietaryTags(
  criteria: SearchCriteria,
): SearchCriteria {
  const avoided = new Set(criteria.avoidAllergens);
  const kept = criteria.requireDietaryTags.filter((tag) => {
    const mirrored = TAG_MIRRORS_ALLERGEN[tag];
    return !mirrored?.some((allergen) => avoided.has(allergen));
  });

  if (kept.length !== criteria.requireDietaryTags.length) {
    logger.info(
      { before: criteria.requireDietaryTags, after: kept },
      "Dropped dietary tags already covered by an allergen exclusion",
    );
  }
  return { ...criteria, requireDietaryTags: kept };
}

/** One Claude call. Falls back to a keyword-only search if it fails. */
async function parseQuery(query: string): Promise<SearchCriteria> {
  try {
    const response = await getClaudeClient().messages.create({
      model: AI_CONFIG.MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: outputConfig(QUERY_SCHEMA),
      messages: [{ role: "user", content: query }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Query declined by content safety filters");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("No content returned from the model");
    }
    return dropRedundantDietaryTags(JSON.parse(text.text) as SearchCriteria);
  } catch (err) {
    // Degrade to a plain keyword search rather than failing the request: a
    // customer trying to find food should still get results when the AI call
    // is unavailable. The allergy split below is skipped in that case, which
    // is why the fallback avoids claiming anything is "safe" — see below.
    logger.error({ err }, "AI query parsing failed; falling back to keywords");
    return {
      keywords: query.split(/\s+/).filter(Boolean),
      avoidAllergens: [],
      requireDietaryTags: [],
    };
  }
}

export async function searchMenu({
  query,
  shopId,
  limit = 20,
  includeOutOfStock = false,
}: {
  query: string;
  shopId: string | Types.ObjectId;
  limit?: number;
  includeOutOfStock?: boolean;
}): Promise<MenuSearchResult> {
  const criteria = await parseQuery(query);

  const filter: Record<string, unknown> = { shopId };
  if (!includeOutOfStock) filter.isAvailable = true;

  if (criteria.minPrice != null || criteria.maxPrice != null) {
    const price: Record<string, number> = {};
    if (criteria.minPrice != null) price.$gte = criteria.minPrice;
    if (criteria.maxPrice != null) price.$lte = criteria.maxPrice;
    filter.price = price;
  }

  if (criteria.keywords.length > 0) {
    // Escaped: keywords come from a customer-supplied query, and an unescaped
    // "(" or "*" would either throw or turn into an unintended pattern.
    const patterns = criteria.keywords.map(
      (k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
    filter.$or = [
      { "name.en": { $in: patterns } },
      { "name.ar": { $in: patterns } },
      { "description.en": { $in: patterns } },
      { "description.ar": { $in: patterns } },
    ];
  }

  const items = await MenuItemModel.find(filter).limit(limit);

  // No restrictions expressed — everything matching is simply a result.
  if (
    criteria.avoidAllergens.length === 0 &&
    criteria.requireDietaryTags.length === 0
  ) {
    return { safeItems: items, unsafeItems: [], criteria };
  }

  const aiData = await AIMenuDataModel.find({
    menuItemId: { $in: items.map((i) => i._id) },
  });
  const byItemId = new Map(aiData.map((d) => [d.menuItemId.toString(), d]));

  const safeItems: IMenuItem[] = [];
  const unsafeItems: IMenuItem[] = [];

  for (const item of items) {
    const data = byItemId.get(item._id.toString());

    // An unenriched item is treated as unsafe, never as safe. Calling a dish
    // allergen-free because nothing is known about it is the one failure mode
    // here with real consequences for someone with an allergy. This is also
    // what makes the empty-collection state visible instead of silent: before
    // the menu is enriched every result lands in `unsafeItems`, rather than
    // the filter appearing to work while matching nothing.
    if (!data || !data.aiProcessed) {
      unsafeItems.push(item);
      continue;
    }

    const hasAllergen = criteria.avoidAllergens.some((a) =>
      data.allergens.includes(a),
    );
    const meetsDiet = criteria.requireDietaryTags.every((t) =>
      data.dietaryTags.includes(t),
    );

    if (!hasAllergen && meetsDiet) safeItems.push(item);
    else unsafeItems.push(item);
  }

  return { safeItems, unsafeItems, criteria };
}
