import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { logger } from "../config/pino";

/**
 * The subset of imgbb's upload response this project relies on.
 * See https://api.imgbb.com/ — the API returns many more fields.
 */
export interface ImgbbUploadResponse {
  success: boolean;
  status: number;
  data?: {
    id: string;
    url: string;
    display_url?: string;
    delete_url?: string;
  };
}

/**
 * How long to wait on imgbb before giving up. A hung upload otherwise holds an
 * Express request (and, on a small instance, a meaningful share of the pool)
 * open indefinitely — and the caller cannot tell "slow" from "never".
 */
const UPLOAD_TIMEOUT_MS = 20_000;

/** Keeps a body excerpt loggable without dumping an entire HTML error page. */
const BODY_LOG_LIMIT = 500;

async function uploadToImgbb(
  file: Express.Multer.File,
): Promise<ImgbbUploadResponse> {
  // IMGBB_KEY is deliberately not in config/env-validation.ts's required list
  // (it would break local dev for anyone not using image upload yet), so it is
  // checked here instead — at the one place that needs it. Without this guard
  // the key interpolates as the literal string "undefined", imgbb answers 400
  // "Invalid API v1 key", and the caller sees a generic upload failure that
  // looks like a bad image rather than a missing deployment variable.
  //
  // This is not hypothetical: creating a shop and regenerating a QR code both
  // upload through here, so an unset key breaks restaurant onboarding outright.
  if (!process.env.IMGBB_KEY) {
    logger.error(
      "IMGBB_KEY is not set. Image upload, shop creation and QR-code " +
        "generation cannot work until it is set in the deployment environment.",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  const formData = new FormData();

  formData.append("image", file.buffer.toString("base64"));

  // Every failure below throws a CustomError rather than being left to
  // propagate as a plain Error. That distinction is load-bearing:
  // qr-code-generator.ts rethrows CustomError untouched but wraps anything
  // else in a bare `Error`, which the global handler flattens to a blank
  // `500 Internal server error` — no status, no message, nothing in the
  // response and (previously) nothing in the log either. That is exactly how
  // `POST /shops/qr-code` came to fail in production on 2026-08-24 while the
  // identical code path succeeded locally, with no way to tell from the
  // outside whether the cause was the key, the network or imgbb itself.
  let response: Response;
  try {
    response = await fetch(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_KEY}`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // Network-level failure: DNS, TLS, connection refused, or our own timeout.
    // Reached only when no HTTP response exists at all, so there is no status
    // or body to report — the error name/message is the entire signal, which
    // is why it must not be swallowed.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    logger.error(
      {
        err: error,
        timedOut,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        host: "api.imgbb.com",
      },
      timedOut
        ? "imgbb upload timed out before any response"
        : "imgbb upload failed at the network level (no HTTP response)",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  // Read the body exactly once, as text. `response.json()` was called directly
  // here before, which throws a SyntaxError on any non-JSON body — and a
  // proxy, WAF or captive portal answering with an HTML page is precisely the
  // production-only failure this function needs to be able to report. Reading
  // text first means the body survives to reach the log either way.
  const rawBody = await response.text().catch(() => "<unreadable body>");

  if (!response.ok) {
    // imgbb explains itself in the body ("Invalid API v1 key", size limits,
    // rate limits). Discarding it left an opaque failure as the only signal,
    // which is the whole reason a missing key was hard to diagnose in
    // production. The detail goes to the log, not to the end user.
    logger.error(
      {
        status: response.status,
        contentType: response.headers.get("content-type"),
        detail: rawBody.slice(0, BODY_LOG_LIMIT),
      },
      "imgbb upload failed",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  let data: ImgbbUploadResponse;
  try {
    data = JSON.parse(rawBody) as ImgbbUploadResponse;
  } catch {
    // A 2xx that is not JSON. Almost always something between us and imgbb
    // answering on its behalf, so log what it actually was: the content type
    // and the first bytes identify an HTML interstitial immediately, where a
    // bare SyntaxError identifies nothing.
    logger.error(
      {
        status: response.status,
        contentType: response.headers.get("content-type"),
        detail: rawBody.slice(0, BODY_LOG_LIMIT),
      },
      "imgbb returned a non-JSON body on a successful status",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  // A 2xx whose payload carries no hosted URL. Callers store `data.url`
  // directly on the shop, so letting this through writes `undefined` and
  // defers the failure to whenever someone looks at the image.
  if (!data?.data?.url) {
    logger.error(
      {
        status: response.status,
        success: data?.success,
        detail: rawBody.slice(0, BODY_LOG_LIMIT),
      },
      "imgbb upload returned no image URL",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  return data;
}
export default uploadToImgbb;
