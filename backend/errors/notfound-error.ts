import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class NotFoundError extends CustomError {
  statusCode = 404;
  customMessage: MessageError;
  lang: LangType;

  constructor(message?: MessageError, lang?: LangType) {
    super(message || { en: "not found error", ar: "العنصر غير موجود" }, lang);
    this.customMessage = message || {
      en: "not found error",
      ar: "العنصر غير موجود",
    };
    this.lang = lang || "en";
  }

  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
