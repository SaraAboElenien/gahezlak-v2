import { validationResult } from "express-validator";
import { RequestHandler } from "express";
import { Errors } from "../errors";

export const validate: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new Errors.ValidationError(errors.array());
  }
  next();
};
