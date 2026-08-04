import { Router } from "express";
import * as aiMenuController from "../controllers/ai-menu.controller";
import { protect } from "../middlewares/auth";
import { isShopMember } from "../middlewares/shop-member-check.middleware";
import { uploadMultipleMiddleware } from "../middlewares/multer";
import { aiRateLimiter } from "../middlewares/rate-limit.middleware";

const aiMenuRoutes = Router();

/**
 * Every route here costs money on a third-party account per request, so the
 * limiter is applied to the whole router rather than per-route — a new
 * endpoint added below is then rate-limited by default rather than by
 * remembering to add it.
 *
 * Seven endpoints were removed from this router (smart-search, allergy-filter,
 * health-insights, condition/:condition, process/:itemId, batch-process,
 * bulk-insert). None was reachable from any client; see CHANGELOG.md.
 */
aiMenuRoutes.use(aiRateLimiter);

/**
 * POST /api/v1/ai/menu/super-search
 *
 * The one genuinely public AI route: menu search runs for customers who are
 * not logged in. It is unauthenticated by necessity, which is exactly why the
 * router-level limiter above matters — and why the handler truncates the query
 * before it reaches the model.
 *
 * Body: { query, shopId, limit?, includeOutOfStock? }
 */
aiMenuRoutes.post("/super-search", aiMenuController.superSearchHandler);

// Everything below requires a logged-in member of the shop being modified.
aiMenuRoutes.use(protect, isShopMember);

/**
 * POST /api/v1/ai/menu/vision-extract
 * Menu OCR. Upload field: `files` (one or more images).
 */
aiMenuRoutes.post(
  "/vision-extract",
  uploadMultipleMiddleware("files"),
  aiMenuController.visionExtractHandler,
);

/**
 * POST /api/v1/ai/menu/enrich/:itemId
 * Derive allergens/dietary tags/ingredients for a single menu item.
 */
aiMenuRoutes.post("/enrich/:itemId", aiMenuController.enrichItemHandler);

/**
 * POST /api/v1/ai/menu/enrich-all
 * Body: { shopId, force? }. Enrich a whole shop's menu — this is what
 * populates `ai_menu_data`, without which allergy and dietary filtering has
 * nothing to filter on.
 */
aiMenuRoutes.post("/enrich-all", aiMenuController.enrichShopHandler);

export { aiMenuRoutes };
