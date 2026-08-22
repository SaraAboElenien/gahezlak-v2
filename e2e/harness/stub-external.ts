/**
 * Stubs every third-party HTTP call the backend can make, at the network
 * boundary, by replacing `globalThis.fetch` in the harness process before any
 * application module is loaded.
 *
 * Why here rather than in the app: the app must not know it is under test.
 * `utils/upload-to-imgbb.ts`, `utils/paymob.ts` and `config/claude.ts` all
 * call bare `fetch`/the SDK against real hosts, and there is no env var that
 * redirects them. Patching the global in the *test harness process* leaves
 * application code untouched while making the suite genuinely hermetic —
 * nothing leaves the machine, and no third-party account or key is needed.
 *
 * imgbb is the one that actually matters: `createShopHandler` unconditionally
 * generates a QR code and uploads it, so shop creation returns 500 without
 * this — which would make the entire signup -> create-shop journey untestable.
 *
 * The final `else` is a deliberate tripwire: anything that is neither stubbed
 * nor local *fails loudly* instead of silently reaching the internet, so a
 * future integration cannot quietly make this suite non-hermetic.
 */

type FetchInput = Parameters<typeof fetch>[0];

/** Records what was handed to imgbb so specs can assert on it (see control.ts). */
export interface ImgbbUpload {
  /** The raw base64 payload the app uploaded. */
  base64: string;
  at: number;
}

const imgbbUploads: ImgbbUpload[] = [];

export function getImgbbUploads(): readonly ImgbbUpload[] {
  return imgbbUploads;
}

export function clearImgbbUploads(): void {
  imgbbUploads.length = 0;
}

/** Discards uploads recorded after `length` — see control.ts's /qr/check. */
export function truncateImgbbUploads(length: number): void {
  imgbbUploads.length = length;
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

    if (host === "api.imgbb.com") {
      // The app posts FormData whose single "image" field is base64 PNG bytes.
      const body = init?.body;
      let base64 = "";
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        base64 = String(body.get("image") ?? "");
      }
      imgbbUploads.push({ base64, at: Date.now() });

      // Shape matches utils/upload-to-imgbb.ts's ImgbbUploadResponse. A data:
      // URI is used rather than a fake http URL so the browser renders the
      // image instead of logging a 404 for every card on the page.
      const hosted =
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      return json({
        success: true,
        status: 200,
        data: {
          id: `e2e-${imgbbUploads.length}`,
          url: hosted,
          display_url: hosted,
          delete_url: hosted,
        },
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
