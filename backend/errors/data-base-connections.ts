import { CustomError } from "./abstract-error-class";
import { ErrorResponse } from "../common/types/controller-response.types";
import { LangType, MessageError } from "../common/types/general-types";

export class DatabaseConnectionError extends CustomError {
  statusCode = 500;
  customMessage: MessageError;
  lang: LangType;
  constructor(message?: MessageError, lang?: LangType) {
    super(
      message || {
        en: "Error connecting to database",
        ar: "خطأ في الاتصال بقاعدة البيانات",
      },
      lang,
    );
    this.customMessage = message || {
      en: "Error connecting to database",
      ar: "خطأ في الاتصال بقاعدة البيانات",
    };
    this.lang = lang || "en";
  }

  serializeError(): ErrorResponse {
    const localizedMessage = this.customMessage[this.lang];
    return { code: this.statusCode, message: localizedMessage, data: {} };
  }
}
