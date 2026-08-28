import crypto from "crypto";
import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { logger } from "../config/pino";
import {
  CLOUDINARY_FOLDER,
  getCloudinaryConfig,
  missingCloudinaryVars,
} from "../config/cloudinary";

/**
 * Uploads an image and returns where it now lives.
 *
 * Named for what it does rather than for the vendor, on purpose. The previous
 * module was `upload-to-imgbb.ts` and three controllers named imgbb in their
 * local variables, so swapping hosts touched every call site — which is a poor
 * trade for a detail none of them care about. They now ask for an image to be
 * hosted and get back a URL.
 *
 * Every failure path throws a CustomError and logs its distinguishing
 * evidence. That is not incidental: `qr-code-generator.ts` used to wrap any
 * non-CustomError in a bare `Error`, which the global handler flattened into a
 * status-less 500, and the imgbb outage consequently presented for weeks as
 * "Internal server error" with nothing in the logs to act on.
 */

export interface UploadedImage {
  /** HTTPS delivery URL. Stored on the shop/menu item and served to browsers. */
  url: string;
  /** Cloudinary's handle for the asset — needed to delete or transform it later. */
  publicId: string;
}

const UPLOAD_TIMEOUT_MS = 20_000;
const BODY_LOG_LIMIT = 500;

/**
 * Cloudinary signs the alphabetically-sorted upload parameters, excluding
 * `file`, `api_key` and `resource_type`, with the API secret appended.
 */
export function sign(
  params: Record<string, string>,
  apiSecret: string,
): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(canonical + apiSecret)
    .digest("hex");
}

export async function uploadImage(
  file: Express.Multer.File,
): Promise<UploadedImage> {
  const config = getCloudinaryConfig();

  if (!config) {
    const missing = missingCloudinaryVars();
    // Named, not just "not configured": the whole point of the incident this
    // replaces is that an unactionable message costs days.
    logger.error(
      { missing },
      "Cloudinary is not configured. Shop logos and menu-item images cannot " +
        "be uploaded until these are set in the deployment environment.",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedParams = { folder: CLOUDINARY_FOLDER, timestamp };

  const form = new FormData();
  // Cloudinary accepts a data URI in `file`. The mime type comes from multer,
  // which already rejects anything that is not `image/*` (see middlewares/multer.ts).
  form.append(
    "file",
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
  );
  form.append("api_key", config.apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", CLOUDINARY_FOLDER);
  form.append("signature", sign(signedParams, config.apiSecret));

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // No HTTP response exists here — DNS, TLS, refused connection, or our own
    // abort — so the error itself is the entire signal.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    logger.error(
      {
        err: error,
        timedOut,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        host: "api.cloudinary.com",
      },
      timedOut
        ? "Cloudinary upload timed out before any response"
        : "Cloudinary upload failed at the network level (no HTTP response)",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  // Read as text exactly once. Calling response.json() directly throws a
  // SyntaxError on any non-JSON body, and an intermediary answering with an
  // HTML page is precisely the production-only failure this needs to report.
  const rawBody = await response.text().catch(() => "<unreadable body>");

  if (!response.ok) {
    // Cloudinary explains itself in the body (bad signature, invalid cloud
    // name, quota). Discarding that is what made the imgbb block undiagnosable.
    logger.error(
      {
        status: response.status,
        contentType: response.headers.get("content-type"),
        detail: rawBody.slice(0, BODY_LOG_LIMIT),
      },
      "Cloudinary upload failed",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  let payload: { secure_url?: string; url?: string; public_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error(
      {
        status: response.status,
        contentType: response.headers.get("content-type"),
        detail: rawBody.slice(0, BODY_LOG_LIMIT),
      },
      "Cloudinary returned a non-JSON body on a successful status",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  // `secure_url` (https) rather than `url` (http): the frontend is served over
  // HTTPS and its CSP forbids mixed content, so an http image would be blocked
  // by the browser and look like a broken upload.
  const url = payload.secure_url;

  if (!url || !payload.public_id) {
    // Callers write this straight onto a shop or menu item, so letting a 2xx
    // with no URL through stores `undefined` and defers the failure to
    // whenever somebody next looks at the image.
    logger.error(
      { status: response.status, detail: rawBody.slice(0, BODY_LOG_LIMIT) },
      "Cloudinary upload returned no image URL",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }

  return { url, publicId: payload.public_id };
}

export default uploadImage;
