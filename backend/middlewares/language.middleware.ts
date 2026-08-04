import { RequestHandler } from "express";

export const languageMiddleware: RequestHandler = (req, res, next) => {
  const lang = req.headers.lang?.toString();
  if (!lang || !["en", "ar"].includes(lang)) {
    req.lang = "en";
  } else {
    req.lang = lang as "en" | "ar";
  }
  next();
};
