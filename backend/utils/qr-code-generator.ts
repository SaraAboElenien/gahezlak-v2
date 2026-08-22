import QRCode from "qrcode";
import uploadToImgbb from "./upload-to-imgbb";
import { Errors } from "../errors";
import { logger } from "../config/pino";

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
 * Generate QR code for shop menu, upload to imgbb, and return the image URL
 * @param shopName - The shop ID to generate QR code for
 * @param baseUrl - Base URL for the menu (default: process.env.FRONTEND_URL)
 * @param options - QR code generation options
 * @returns Promise<{ qrCodeUrl: string; menuUrl: string }>
 */
export async function generateAndUploadMenuQRCode(
  shopName: string,
  baseUrl: string = process.env.FRONTEND_URL || "http://localhost:3000",
  options: QRCodeOptions = {},
): Promise<{ qrCodeUrl: string; menuUrl: string }> {
  try {
    // Construct the menu URL.
    //
    // encodeURIComponent is not cosmetic here. Shop names are free text, and
    // this string is burned permanently into a printed QR code — a name
    // containing "#" or "?" silently truncates the path at scan time ("Joe's
    // Diner #2" becomes /shops/Joe's Diner ), so the diner lands on a 404 and
    // nothing server-side ever observes the failure. Encoding is transparent
    // to the SPA, which decodes route params before matching.
    const menuUrl = `${baseUrl}/shops/${encodeURIComponent(shopName)}/menu`;

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

    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(menuUrl, qrOptions);

    // Create a file-like object for uploadToImgbb
    const fakeFile = {
      buffer: qrCodeBuffer,
    } as Express.Multer.File;

    // Upload to imgbb
    const imgbbResponse = await uploadToImgbb(fakeFile);
    const qrCodeUrl = imgbbResponse?.data?.url;
    // A 2xx response with no hosted URL would otherwise be stored on the shop
    // as `qrCodeUrl: undefined` and only surface much later as a broken image.
    if (!qrCodeUrl) {
      throw new Error("imgbb upload succeeded but returned no image URL");
    }

    return {
      qrCodeUrl,
      menuUrl,
    };
  } catch (error) {
    // Do NOT flatten typed errors into a bare Error. This catch used to wrap
    // everything — including the BadRequestError that uploadToImgbb throws for
    // a missing/invalid IMGBB_KEY — which stripped the status code and message
    // the global error handler relies on, so every cause surfaced identically
    // as a blank 500 "Internal server error". That is exactly how an unset
    // IMGBB_KEY in production stayed invisible: the endpoint answered 500 while
    // the same code path succeeded locally, and the response said nothing.
    if (error instanceof Errors.CustomError) {
      throw error;
    }
    logger.error({ err: error }, "QR code generation failed");
    throw new Error(
      `Failed to generate and upload QR code: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
