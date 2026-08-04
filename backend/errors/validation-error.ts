import { ValidationError as vError } from "express-validator";

import { CustomError } from "./abstract-error-class";
import { ValidationErrorResponse } from "../common/types/controller-response.types";

export class ValidationError extends CustomError {
  statusCode = 422;

  constructor(public error: vError[]) {
    super({ en: "validation error", ar: "" }, "en");
  }

  serializeError(): ValidationErrorResponse {
    return this.error.map((el) => {
      if (el.type === "field") return { message: el.msg, field: el.path };
      return { message: el.msg };
    });
  }
}
