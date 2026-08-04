import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class NotAllowedError extends CustomError {
  statusCode: number = 405;
  customMessage: MessageError;
  lang: LangType;
  constructor(message?: MessageError, lang?: LangType) {
    super(message || { en: "not allowed", ar: "غير مسموح" }, lang);
    this.customMessage = message || { en: "not allowed", ar: "غير مسموح" };
    this.lang = lang || "en";
  }
  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
