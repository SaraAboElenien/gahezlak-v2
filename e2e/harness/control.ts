/**
 * A tiny HTTP control plane the specs talk to, running inside the harness
 * process alongside the backend but on its own port.
 *
 * This is test infrastructure, never part of the application: it is created by
 * `serve.ts`, which only ever runs under Playwright. Keeping it out-of-band is
 * what makes it possible to hold the "no application code changes" line — the
 * two things a browser genuinely cannot do for itself are
 *
 *   1. read the emailed verification code (the harness has no mail server, and
 *      reading the OTP out of the ephemeral database is both simpler and more
 *      honest than intercepting SMTP), and
 *   2. reset the world between tests.
 *
 * Resetting matters more than it looks. The auth router is rate-limited to 20
 * requests per 15 minutes per IP, and the SPA POSTs `/auth/refresh` on *every*
 * page load — so without clearing `rate_limits`, a handful of tests would start
 * failing with 429s that have nothing to do with what they assert.
 */
import { createServer, type Server } from "node:http";
import { Users } from "../../backend/models/User";
import { Orders } from "../../backend/models/Order";
import { Shops } from "../../backend/models/Shop";
import { generateAndUploadMenuQRCode } from "../../backend/utils/qr-code-generator";
import { reseed } from "./seed";
import {
  clearImgbbUploads,
  getImgbbUploads,
  truncateImgbbUploads,
} from "./stub-external";

function send(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body ?? null);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createControlServer(): Server {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://control.invalid");
      const path = url.pathname;

      try {
        if (path === "/health") {
          return send(response, 200, { status: "ok" });
        }

        /** Drop everything and rebuild the fixture set. */
        if (path === "/reset" && request.method === "POST") {
          clearImgbbUploads();
          const ids = await reseed();
          return send(response, 200, ids);
        }

        /**
         * The OTP that would have been emailed. Returns 404 rather than null so
         * a spec that polls this cannot mistake "no user" for "no code yet".
         */
        if (path === "/verification-code") {
          const email = (url.searchParams.get("email") ?? "").toLowerCase();
          const user = await Users.findOne({ email })
            .select("+verificationCode")
            .lean();
          if (!user) return send(response, 404, { error: "no such user" });
          return send(response, 200, {
            code: user.verificationCode?.code ?? null,
            reason: user.verificationCode?.reason ?? null,
            isVerified: user.isVerified,
          });
        }

        /** One order by its human-facing number, for asserting persisted state. */
        if (path === "/order") {
          const orderNumber = Number(url.searchParams.get("number"));
          const order = await Orders.findOne({ orderNumber }).lean();
          if (!order) return send(response, 404, { error: "no such order" });
          return send(response, 200, order);
        }

        /** Every order, newest first. */
        if (path === "/orders") {
          const orders = await Orders.find().sort({ createdAt: -1 }).lean();
          return send(response, 200, { orders });
        }

        /** One shop by name — used to read back `qrCodeUrl` / `logoUrl`. */
        if (path === "/shop") {
          const name = url.searchParams.get("name") ?? "";
          const shop = await Shops.findOne({ name }).lean();
          if (!shop) return send(response, 404, { error: "no such shop" });
          return send(response, 200, shop);
        }

        /**
         * Regression guard for the "QR codes encode a stale FRONTEND_URL"
         * defect: `utils/qr-code-generator.ts` bakes the origin in at creation
         * time, so a shop created while FRONTEND_URL pointed at a dev server
         * keeps a QR that goes nowhere forever.
         *
         * Rather than decode the PNG (which would need a QR *reader*), this
         * re-encodes what the QR should contain right now — same generator,
         * same options, current FRONTEND_URL — and compares the bytes against
         * what the app actually uploaded when the shop was created. `qrcode`
         * output is deterministic, so equal bytes means equal encoded URL.
         *
         * The re-encode is itself an imgbb upload, so the recorded list is
         * snapshotted and restored around it to keep `index` stable.
         */
        if (path === "/qr/check") {
          const shopName = url.searchParams.get("shop") ?? "";
          const index = Number(url.searchParams.get("index") ?? "0");
          const recorded = getImgbbUploads()[index];
          if (!recorded) {
            return send(response, 404, {
              error: `no imgbb upload recorded at index ${index}`,
              uploadCount: getImgbbUploads().length,
            });
          }

          const before = getImgbbUploads().length;
          const { menuUrl } = await generateAndUploadMenuQRCode(shopName);
          const expected = getImgbbUploads()[before];
          // Undo the extra upload this check just caused.
          truncateImgbbUploads(before);

          return send(response, 200, {
            matches: expected?.base64 === recorded.base64,
            menuUrl,
          });
        }

        return send(response, 404, { error: `unknown control route ${path}` });
      } catch (error) {
        return send(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}
