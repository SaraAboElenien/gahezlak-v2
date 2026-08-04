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
