import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { CurrentUserPayload } from "../common/types/general-types";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { Users } from "../models/User";
import { IRole } from "../models/Role";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(errMsg.JWT_SECRET_NOT_DEFINED.en);
}

export const protect = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Unchanged mechanism: the access token is still presented as an
    // `Authorization: Bearer` header. Only the *refresh* token moved into an
    // httpOnly cookie (config/cookies.ts).
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "Not Authenticated" });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as CurrentUserPayload;

    req.user = decoded;
    next();
  } catch {
    throw new Errors.UnauthenticatedError();
  }
};

/**
 * Role gate. Reads the user's *current* role from the database rather than
 * trusting the `role` claim on the access token.
 *
 * The claim is a snapshot taken at sign-in and access tokens live an hour, so
 * trusting it meant a revoked permission stayed usable for up to an hour after
 * an administrator had been told it was gone. That is the wrong direction to
 * be wrong in: `isAllowed` is what stands between a demoted manager and the
 * staff, plan and shop-settings endpoints.
 *
 * The cost is one indexed lookup, and only on routes that actually gate by
 * role — `protect` alone still does no database work. The alternative that
 * avoids the query is a token-version field checked on every request, which is
 * a larger change to the auth core and would want its own ADR.
 */
export const isAllowed = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new Errors.UnauthenticatedError();
    }

    const user = await Users.findById(userId)
      .select("role")
      .populate<{ role: IRole }>("role", "name")
      .lean();

    const currentRole = user?.role?.name;
    if (!currentRole || !roles.includes(currentRole)) {
      throw new Errors.UnauthorizedError();
    }

    // Downstream handlers read req.user.role; leaving the stale claim in place
    // would just move the same bug one layer along.
    req.user!.role = currentRole;

    next();
  };
};
