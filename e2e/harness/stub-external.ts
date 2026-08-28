/**
 * Stubs every third-party HTTP call the backend can make, at the network
 * boundary, by replacing `globalThis.fetch` in the harness process before any
 * application module is loaded.
 *
 * Why here rather than in the app: the app must not know it is under test.
 * `utils/upload-image.ts`, `utils/paymob.ts` and `config/claude.ts` all call
 * bare `fetch`/the SDK against real hosts, and there is no env var that
 * redirects them. Patching the global in the *test harness process* leaves
 * application code untouched while making the suite genuinely hermetic —
 * nothing leaves the machine, and no third-party account or key is needed.
 *
 * The image host is the one that actually matters, and it is worth knowing
 * WHICH host that is. It used to be imgbb, and the reason it no longer is is
 * the whole point of stubbing at this layer: imgbb began rejecting every
 * request from the deployed host's datacenter IP range, which broke shop
 * creation and every image upload on the live site while every mocked unit
 * test stayed green. Uploads now go to Cloudinary via a signed REST call in
 * `utils/upload-image.ts`, so that is what is stubbed here. Attaching a photo
 * to a menu item (see `owner-menu.spec.ts`) genuinely traverses that code
 * path; without this stub it would fail.
 *
 * Note there is deliberately NO imgbb branch any more. If application code
 * ever reaches for `api.imgbb.com` again it hits the tripwire below and fails
 * loudly, rather than being quietly serviced by a stub for a host the app is
 * supposed to have left behind.
 *
 * The final `else` is that tripwire: anything that is neither stubbed nor
 * local *fails loudly* instead of silently reaching the internet, so a future
 * integration cannot quietly make this suite non-hermetic.
 */

type FetchInput = Parameters<typeof fetch>[0];

/**
 * Records what was handed to the image host so specs can assert on it (see
 * control.ts's `/image-uploads`).
 */
export interface ImageUpload {
  /** The full `data:<mime>;base64,<payload>` URI the app posted. */
  dataUri: string;
  /** Just the base64 payload, so a spec can compare it to the bytes it attached. */
  base64: string;
  at: number;
}

const imageUploads: ImageUpload[] = [];

export function getImageUploads(): readonly ImageUpload[] {
  return imageUploads;
}

export function clearImageUploads(): void {
  imageUploads.length = 0;
}

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * A 1x1 transparent GIF, returned as the "hosted" URL. A data: URI rather
 * than a plausible-looking https one so the browser renders the image instead
 * of logging a failed request for every card on the page.
 */
const HOSTED_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function installExternalStubs(): void {
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: FetchInput, init?: RequestInit) => {
    const url = urlOf(input);
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      // Relative URL — cannot be a third-party call.
      return realFetch(input as never, init);
    }

    if (host === "api.cloudinary.com") {
      // `utils/upload-image.ts` posts FormData whose "file" field is a data
      // URI built from the multer buffer, alongside api_key/timestamp/
      // folder/signature. Only the file is worth recording.
      const body = init?.body;
      let dataUri = "";
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        dataUri = String(body.get("file") ?? "");
      }
      const base64 = dataUri.includes(",") ? dataUri.split(",")[1] : "";
      imageUploads.push({ dataUri, base64, at: Date.now() });

      // Shape matches what utils/upload-image.ts reads: it requires BOTH
      // `secure_url` and `public_id`, and deliberately ignores `url` (http)
      // because the frontend's CSP forbids mixed content. Returning a
      // response missing either field would make the uploader throw, which is
      // correct behaviour on its part and would look like a broken test here.
      return json({
        secure_url: HOSTED_IMAGE,
        url: HOSTED_IMAGE,
        public_id: `gahezlak/e2e-${imageUploads.length}`,
        format: "gif",
        resource_type: "image",
      });
    }

    if (host.endsWith("paymob.com")) {
      // No spec exercises a card payment (that needs Paymob's real hosted
      // checkout and a sandbox account). Failing clearly beats a plausible
      // fake that would let a broken payment path pass.
      return json(
        { detail: "Paymob is not available in the e2e environment." },
        503,
      );
    }

    if (host.endsWith("anthropic.com")) {
      return json(
        { type: "error", error: { message: "AI disabled in e2e." } },
        503,
      );
    }

    if (LOCAL_HOSTS.has(host)) {
      return realFetch(input as never, init);
    }

    throw new Error(
      `[e2e] Blocked outbound request to ${host}. The suite is hermetic: add a ` +
        `stub in e2e/harness/stub-external.ts rather than letting it reach the network.`,
    );
  }) as typeof fetch;
}
