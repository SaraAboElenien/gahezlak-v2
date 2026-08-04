import {
  ErrorResponse,
  ValidationErrorResponse,
} from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export abstract class CustomError extends Error {
  abstract statusCode: number;
  constructor(message: MessageError, lang?: LangType) {
    if (lang === "ar") super(message.ar);
    else super(message.en);
  }

  abstract serializeError(): ErrorResponse | ValidationErrorResponse;
}
