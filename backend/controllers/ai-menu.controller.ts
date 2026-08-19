import { RequestHandler } from "express";
import { Errors } from "../errors";
import { logger } from "../config/pino";
import { aiEnabled } from "../config/claude";
import { extractMenuFromFile } from "../services/ai/menu-extract.service";
import { searchMenu } from "../services/ai/menu-search.service";
import {
  enrichMenuItem,
  enrichShopMenu,
} from "../services/ai/menu-enrich.service";

/**
 * AI menu endpoints.
 *
 * This file was 798 lines covering nine handlers, seven of which were
 * unreachable from any client. What remains is the two the frontend actually
 * calls (OCR and search) plus the two that make the search work at all
 * (enrichment) — see CHANGELOG.md for what was removed and why.
 */

/**
 * AI features are optional and no-op without a key. Fail with a clear message
 * rather than letting an "ANTHROPIC_API_KEY is required" throw surface to a
 * customer as an opaque 500.
 */
function ensureAiEnabled() {
  if (!aiEnabled()) {
    throw new Errors.UnprocessableError({
      ar: "ميزات الذكاء الاصطناعي غير مفعّلة حاليًا",
      en: "AI features are not currently configured",
    });
  }
}

/**
 * The shop these enrichment writes belong to.
 *
 * Resolved exactly the way `isShopMember` resolves it, and deliberately in
 * that order — the middleware validated whichever of the two it landed on, so
 * reading a different one here would mean writing to a shop nobody checked.
 */
function resolveCallerShopId(req: Parameters<RequestHandler>[0]): string {
  const shopId = req.body?.shopId || req.user?.shopId;
  if (!shopId) {
    throw new Errors.BadRequestError({
      ar: "معرف المتجر مطلوب",
      en: "shopId is required",
    });
  }
  return String(shopId);
}

/**
 * POST /api/v1/ai/menu/vision-extract
 * Multipart upload field: `files`. Staff/admin only.
 */
export const visionExtractHandler: RequestHandler = async (req, res, next) => {
  try {
    ensureAiEnabled();

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new Errors.BadRequestError({
        ar: "لم يتم رفع أي صورة",
        en: "No image was uploaded",
      });
    }

    const items = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // Sequential on purpose: each page is a separate vision call, and firing a
    // whole menu's worth in parallel is the reliable way to hit a rate limit.
    for (const file of files) {
      const result = await extractMenuFromFile(file.buffer, file.mimetype, {
        languageHint: req.body?.languageHint,
        categoryHint: req.body?.categoryHint,
      });
      items.push(...result.items);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    res.status(200).json({
      message: "Menu extracted",
      data: { items, errors, warnings },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/ai/menu/super-search
 * Public — a customer browsing a menu is not logged in.
 *
 * The path keeps its original name so the deployed frontend
 * (`publicShopApi.searchWithAi`) keeps working, and the response keeps the
 * `{ safeItems, unsafeItems }` shape it already renders.
 */
export const superSearchHandler: RequestHandler = async (req, res, next) => {
  try {
    ensureAiEnabled();

    const { query, shopId, limit, includeOutOfStock } = req.body ?? {};
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new Errors.BadRequestError({
        ar: "نص البحث مطلوب",
        en: "A search query is required",
      });
    }
    if (!shopId) {
      throw new Errors.BadRequestError({
        ar: "معرف المتجر مطلوب",
        en: "shopId is required",
      });
    }

    const result = await searchMenu({
      // Bounded before it reaches the model: this body is public and otherwise
      // unbounded, and prompt length is exactly what the endpoint is billed on.
      query: query.trim().slice(0, 500),
      shopId,
      limit: Math.min(Number(limit) || 20, 50),
      includeOutOfStock: Boolean(includeOutOfStock),
    });

    res.status(200).json({
      message: "Search completed",
      data: {
        safeItems: result.safeItems,
        unsafeItems: result.unsafeItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/ai/menu/enrich/:itemId
 * Derives allergens/dietary tags/ingredients for one item.
 */
export const enrichItemHandler: RequestHandler = async (req, res, next) => {
  try {
    ensureAiEnabled();

    // Scoped to the caller's own shop. `isShopMember` cannot do this for us:
    // the path carries `:itemId`, not `:shopId`, so it falls back to the
    // caller's shop from the token and confirms they belong to it — true, and
    // irrelevant to which item they just asked us to enrich. See
    // services/ai/menu-enrich.service.ts.
    const shopId = resolveCallerShopId(req);

    const result = await enrichMenuItem(req.params.itemId, { shopId });

    res.status(200).json({ message: "Menu item enriched", data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/ai/menu/enrich-all
 * Body: { shopId, force? }. Enriches a whole shop's menu.
 */
export const enrichShopHandler: RequestHandler = async (req, res, next) => {
  try {
    ensureAiEnabled();

    // shopId is optional in the body: a shop owner or staff member enriching
    // their own menu has it on their token already, and requiring it in the
    // body meant the dashboard had to source a value it never held. An admin
    // acting on another shop still passes it explicitly, and `isShopMember`
    // resolves it the same way before this runs.
    const shopId = resolveCallerShopId(req);
    const { force } = req.body ?? {};

    const summary = await enrichShopMenu(shopId, { force: Boolean(force) });
    logger.info({ shopId, summary }, "Shop menu enrichment finished");

    res
      .status(200)
      .json({ message: "Menu enrichment complete", data: summary });
  } catch (error) {
    next(error);
  }
};
