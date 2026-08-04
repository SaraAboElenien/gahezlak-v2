import QRCode from "qrcode";
import uploadToImgbb from "./upload-to-imgbb";

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
    // Construct the menu URL
    const menuUrl = `${baseUrl}/shops/${shopName}/menu`;

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
    throw new Error(
      `Failed to generate and upload QR code: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
