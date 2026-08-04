import { Buffer } from "buffer";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { getClaudeClient, AI_CONFIG } from "../../config/claude";
import { logger } from "../../config/pino";

/**
 * Menu OCR — turn a photo of a printed menu into structured items.
 *
 * Replaces the OpenAI implementation. Two things changed beyond the provider:
 *
 * 1. The old version asked for JSON in prose and then scraped it back out of
 *    the reply with a regex over markdown code fences. Any stray prose, a
 *    truncated reply, or a fence the model didn't emit produced "Failed to
 *    parse AI response" — with the whole extraction lost. This uses structured
 *    outputs (`output_config.format`), so the response is constrained to the
 *    schema and `JSON.parse` cannot fail on well-formed output.
 * 2. The model is no longer hardcoded. The old file pinned "gpt-4o-mini"
 *    directly while a config constant sat unused two files away, so the
 *    configured model silently did nothing.
 */

export interface MenuExtractionOptions {
  languageHint?: string;
  categoryHint?: string;
}

export interface ExtractedMenuItem {
  category?: string;
  name: string;
  description?: string;
  price?: number;
}

export interface MenuExtractionResult {
  items: ExtractedMenuItem[];
  errors: string[];
  warnings: string[];
}

/** Constrains the reply shape. `additionalProperties: false` is required. */
const MENU_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SUPPORTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Downscale before upload. Claude accepts up to 2576px on the long edge, but
 * a full-resolution phone photo costs several times the image tokens of a
 * 1568px one for no accuracy gain on printed text.
 */
async function optimizeImage(
  img: Buffer,
  mimetype: string,
): Promise<{ buffer: Buffer; mediaType: string }> {
  const image = sharp(img).rotate(); // honour EXIF orientation
  const metadata = await image.metadata();

  if (
    (metadata.width && metadata.width > 1568) ||
    (metadata.height && metadata.height > 1568)
  ) {
    image.resize({
      width: 1568,
      height: 1568,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Normalise everything to JPEG: one media type to declare, and a photo of a
  // menu compresses far better as JPEG than PNG.
  if (mimetype === "image/png" && metadata.hasAlpha) {
    return {
      buffer: await image.png({ compressionLevel: 8 }).toBuffer(),
      mediaType: "image/png",
    };
  }
  return {
    buffer: await image.jpeg({ quality: 80 }).toBuffer(),
    mediaType: "image/jpeg",
  };
}

function buildPrompt(options: MenuExtractionOptions): string {
  const lines = [
    "Extract every menu item from this image.",
    "",
    "Rules:",
    "- One entry per dish. Do not invent items that aren't visible.",
    "- `price` must be a number only, with no currency symbol. Omit it if the price isn't legible.",
    "- `category` is the section heading the dish sits under (e.g. Appetizers), if there is one.",
    "- Keep `name` and `description` in the language they are written in; do not translate.",
    "- Ignore anything that isn't a menu item: addresses, phone numbers, opening hours, slogans.",
    "- If the image contains no menu at all, return an empty items array.",
  ];
  if (options.languageHint) {
    lines.push(`- The menu is written in ${options.languageHint}.`);
  }
  if (options.categoryHint) {
    lines.push(`- Focus on the "${options.categoryHint}" section.`);
  }
  return lines.join("\n");
}

async function extractFromImage(
  img: Buffer,
  mimetype: string,
  options: MenuExtractionOptions,
): Promise<ExtractedMenuItem[]> {
  const { buffer, mediaType } = await optimizeImage(img, mimetype);

  const response = await getClaudeClient().messages.create({
    model: AI_CONFIG.MODEL,
    max_tokens: AI_CONFIG.MAX_TOKENS,
    output_config: { format: { type: "json_schema", schema: MENU_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png",
              data: buffer.toString("base64"),
            },
          },
          { type: "text", text: buildPrompt(options) },
        ],
      },
    ],
  });

  // A safety decline returns 200 with an empty/partial body — reading
  // content[0] unconditionally would throw on a valid response.
  if (response.stop_reason === "refusal") {
    throw new Error("The image was declined by content safety filters");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The menu was too long to extract in one pass — try photographing fewer sections at a time",
    );
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No content returned from the model");
  }

  const parsed = JSON.parse(text.text) as { items?: ExtractedMenuItem[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
}

/**
 * Turns whatever went wrong into something a restaurant owner can act on.
 *
 * Without this the raw SDK error reaches the dashboard verbatim — a real run
 * with an unfunded account produced:
 *
 *   Could not read this image: 400 {"type":"error","error":{"type":
 *   "invalid_request_error","message":"Your credit balance is too low..."}}
 *
 * Three things wrong with that: it blames the owner's photo for an account
 * problem, it means nothing to someone who never bought API credits, and it
 * leaks provider internals to an end user. The full error is still logged
 * server-side, where it's actually useful.
 */
function toUserFacingMessage(err: unknown): string {
  // Errors we raise ourselves are already written for the owner.
  if (err instanceof Error && !(err instanceof Anthropic.APIError)) {
    return err.message;
  }

  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    if (status === 401 || status === 403) {
      return "The menu-reading service is not configured correctly. Please contact support.";
    }
    if (status === 429) {
      return "The menu-reading service is busy right now. Please wait a moment and try again.";
    }
    if (status && status >= 500) {
      return "The menu-reading service is temporarily unavailable. Please try again shortly.";
    }
    // 400s that are our request's fault shouldn't tell the owner to fix their
    // photo either — billing and quota problems land here.
    return "The menu-reading service is unavailable. Please contact support.";
  }

  return "Something went wrong reading this image. Please try again.";
}

export async function extractMenuFromFile(
  fileBuffer: Buffer,
  fileType: string,
  options: MenuExtractionOptions = {},
): Promise<MenuExtractionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!SUPPORTED_MIME.includes(fileType)) {
    errors.push(
      `Unsupported file type "${fileType}". Upload a JPG, PNG, WebP or GIF image.`,
    );
    return { items: [], errors, warnings };
  }
  if (!fileBuffer || fileBuffer.length === 0) {
    errors.push("No file provided or the file is empty.");
    return { items: [], errors, warnings };
  }

  try {
    const items = await extractFromImage(fileBuffer, fileType, options);
    if (items.length === 0) {
      warnings.push("No menu items were found in this image.");
    }
    return { items, errors, warnings };
  } catch (err) {
    const message = toUserFacingMessage(err);
    logger.error({ err }, "Menu extraction failed");
    // Reported as an error, not a warning: the old version pushed this to
    // `warnings` and returned an empty item list, so a total failure looked
    // to the caller like a menu that simply had nothing on it.
    errors.push(`Could not read this image: ${message}`);
    return { items: [], errors, warnings };
  }
}
