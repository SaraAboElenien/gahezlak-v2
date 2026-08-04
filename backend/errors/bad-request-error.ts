import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class BadRequestError extends CustomError {
  statusCode: number = 400;
  customMessage: MessageError;
  lang: LangType;
  constructor(message?: MessageError, lang?: LangType) {
    super(
      message || { en: "bad request error", ar: "هناك مشكلة بالطلب" },
      lang,
    );
    this.customMessage = message || {
      en: "bad request error",
      ar: "هناك مشكلة بالطلب",
    };
    this.lang = lang || "en";
  }

  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
