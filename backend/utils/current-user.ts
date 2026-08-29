import { CurrentUserPayload } from "../common/types/general-types";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";

/**
 * Returns the authenticated user that the `protect` middleware attaches to the
 * request.
 *
 * Controllers used to reach for `req.user?.userId!` — "this might be undefined,
 * but trust me". If such a handler were ever mounted without `protect` (or
 * behind a middleware ordering mistake), that assertion silently produced
 * `undefined` and the failure surfaced far away as a confusing 404/500 from a
 * service. Going through this helper turns that into an honest 401 at the
 * point the assumption is made.
 */
// Structurally typed rather than taking `Request` so it accepts every
// `RequestHandler<P, ResBody, ReqBody, Query>` specialisation.
export function requireUser(req: {
  user?: CurrentUserPayload;
}): CurrentUserPayload {
  if (!req.user) {
    throw new Errors.UnauthenticatedError(errMsg.USER_NOT_AUTHENTICATED);
  }
  return req.user;
}

/**
 * Returns the authenticated user's shop id, or fails with an honest 400.
 *
 * `CurrentUserPayload.shopId` is optional because the token genuinely omits it
 * — `generateTokens` signs `user.shop?._id.toString()`, so every user between
 * signup and shop creation and every platform admin carries a token with no
 * shop at all. Handlers that scope a query by shop cannot proceed without one.
 *
 * The alternative — a non-null assertion — puts `undefined` into the filter
 * instead. Mongoose drops an `undefined` value from a query condition rather
 * than matching nothing, so `{ shopId: undefined }` degrades to `{}`: the
 * handler answers 200 with another tenant's data instead of refusing. That is
 * the same collapse-to-`{}` failure already fixed in `getShop`,
 * `getMenuItemsByShop` and `getCategoriesByShop` (2026-08-24), and it is why
 * this throws rather than asserting.
 *
 * `USER_HAS_NO_SHOP` is reused deliberately: `subscription.controller.ts`
 * already raises exactly that for exactly this condition.
 */
export function requireShopId(req: { user?: CurrentUserPayload }): string {
  const { shopId } = requireUser(req);
  if (!shopId) {
    throw new Errors.BadRequestError(errMsg.USER_HAS_NO_SHOP);
  }
  return shopId;
}
