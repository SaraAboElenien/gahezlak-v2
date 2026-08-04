import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class TooManyRequestsError extends CustomError {
  statusCode = 429;
  customMessage: MessageError;
  lang: LangType;
  constructor(message?: MessageError, lang?: LangType) {
    super(
      message || {
        en: "Too many requests. Please try again later.",
        ar: "طلبات كثيرة جدًا. يرجى المحاولة مرة أخرى لاحقًا.",
      },
      lang,
    );
    this.customMessage = message || {
      en: "Too many requests. Please try again later.",
      ar: "طلبات كثيرة جدًا. يرجى المحاولة مرة أخرى لاحقًا.",
    };
    this.lang = lang || "en";
  }

  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
