import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class UnauthorizedError extends CustomError {
  statusCode = 403;
  customMessage: MessageError;
  lang: LangType;
  constructor(message?: MessageError, lang?: LangType) {
    super(
      message || { en: "unauthorized error", ar: "لا تملك صلاحية الوصول" },
      lang,
    );
    this.customMessage = message || {
      en: "unauthorized error",
      ar: "لا تملك صلاحية الوصول",
    };
    this.lang = lang || "en";
  }

  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
