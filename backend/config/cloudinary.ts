/**
 * Cloudinary credentials, read once and validated at the point of use.
 *
 * Deliberately NOT in config/env-validation.ts's required list, matching every
 * other optional integration here (IMGBB_KEY, ANTHROPIC_API_KEY, SENTRY_DSN):
 * local development must boot without image hosting configured. The check
 * happens in the uploader instead, where a missing value can be reported as
 * the deployment problem it is rather than as a broken image.
 *
 * Why Cloudinary at all: images were hosted on imgbb, which on 2026-08-24 was
 * found to reject every request from the deployed host with
 * `{"error":{"message":"You have been forbidden to use this website.","code":103}}`
 * while the same key worked from a residential IP — i.e. it blocks datacenter
 * ranges. That broke shop creation, logo changes and menu-item images on the
 * live site, silently, for anyone who tried to sign up.
 *
 * No SDK. The REST upload endpoint needs one sha1 signature, and going direct
 * keeps the hardened error reporting in utils/upload-image.ts (which exists
 * because the imgbb failure surfaced for weeks as a blank 500 with nothing in
 * the logs) rather than delegating it to a vendor client with its own ideas.
 */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Folder every upload lands in, so the account stays legible and a stray key
 * shared with another project cannot silently interleave with ours.
 */
export const CLOUDINARY_FOLDER = "gahezlak";

/** Read lazily: env vars are injected by the host and must not be captured at import time. */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return null;

  return { cloudName, apiKey, apiSecret };
}

/** Which of the three are missing — so the log can name them rather than say "not configured". */
export function missingCloudinaryVars(): string[] {
  return [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ].filter((name) => !process.env[name]);
}
