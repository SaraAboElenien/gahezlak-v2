import QRCode from "qrcode";

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Build the menu URL a shop's QR code should encode.
 *
 * encodeURIComponent is not cosmetic here. Shop names are free text, and this
 * string is what a diner's camera resolves to on every scan — a name
 * containing "#" or "?" would otherwise silently truncate the path ("Joe's
 * Diner #2" becomes /shops/Joe's Diner ), so the diner lands on a 404 and
 * nothing server-side ever observes the failure. Encoding is transparent to
 * the SPA, which decodes route params before matching.
 *
 * `baseUrl` defaults to `process.env.FRONTEND_URL` evaluated at *call* time,
 * not import time — that distinction is the entire point of generating QR
 * codes on demand rather than once at shop creation. The old
 * `generateAndUploadMenuQRCode` (removed — see qr-code-generator.test.ts's
 * history and DECISIONS.md) rendered a PNG once, uploaded it to imgbb, and
 * stored *that image's address* on the shop forever; if FRONTEND_URL held a
 * dev value at that one moment, or the shop was later renamed, the encoded
 * URL was permanently wrong and nothing ever re-checked it. Reading the env
 * var fresh on every call means every request reflects whatever is
 * configured right now.
 */
export function buildMenuUrl(
  shopName: string,
  baseUrl: string = process.env.FRONTEND_URL || "http://localhost:3000",
): string {
  return `${baseUrl}/shops/${encodeURIComponent(shopName)}/menu`;
}

/**
 * Render a shop's menu QR code as a PNG buffer, on demand.
 *
 * No network call, no hosting, nothing persisted — a QR code is a pure
 * function of the menu URL it encodes, so there is nothing here that needs
 * uploading anywhere. This is what let the QR path drop imgbb entirely:
 * imgbb started refusing requests from the deployed host's datacenter IP
 * range (`103 forbidden`), which blocked shop creation outright, and a
 * previously-uploaded image had independently gone 404. Neither failure mode
 * can happen to a value that is computed fresh per request instead of stored.
 */
export async function generateMenuQRCodeBuffer(
  shopName: string,
  baseUrl?: string,
  options: QRCodeOptions = {},
): Promise<{ buffer: Buffer; menuUrl: string }> {
  const menuUrl = buildMenuUrl(shopName, baseUrl);

  // Default QR code options optimized for menu scanning
  const qrOptions = {
    width: options.width || 300,
    margin: options.margin || 2,
    color: {
      dark: options.color?.dark || "#000000",
      light: options.color?.light || "#FFFFFF",
    },
    errorCorrectionLevel: options.errorCorrectionLevel || ("M" as const),
  };

  const buffer = await QRCode.toBuffer(menuUrl, qrOptions);

  return { buffer, menuUrl };
}
