import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { CurrentUserPayload } from "../common/types/general-types";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";

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

export const isAllowed = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role || "")) {
      throw new Errors.UnauthorizedError();
    }
    next();
  };
};
