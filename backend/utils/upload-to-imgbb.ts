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
  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_KEY}`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    // imgbb explains itself in the body ("Invalid API v1 key", size limits,
    // rate limits). Discarding it left an opaque failure as the only signal,
    // which is the whole reason a missing key was hard to diagnose in
    // production. The detail goes to the log, not to the end user.
    const detail = await response.text().catch(() => "<unreadable body>");
    logger.error(
      { status: response.status, detail: detail.slice(0, 500) },
      "imgbb upload failed",
    );
    throw new Errors.BadRequestError(errMsg.IMAGE_UPLOAD_FAILED);
  }
  const data = await response.json();

  return data;
}
export default uploadToImgbb;
