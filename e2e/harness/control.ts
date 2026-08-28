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
import { reseed } from "./seed";
import { clearImageUploads, getImageUploads } from "./stub-external";

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
          clearImageUploads();
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

        /**
         * One shop by name — used to read back what the app persisted, e.g.
         * `logoUrl` after an upload, or that shop creation stored the name the
         * form submitted.
         *
         * It deliberately does NOT serve the QR code. `Shop.qrCodeUrl` still
         * exists on the schema for old production rows but is written nowhere
         * and read nowhere: the QR is rendered on demand by
         * `GET /api/v1/shops/name/:shopName/qr-code.png`, and the specs assert
         * against that route by decoding the PNG it returns.
         */
        if (path === "/shop") {
          const name = url.searchParams.get("name") ?? "";
          const shop = await Shops.findOne({ name }).lean();
          if (!shop) return send(response, 404, { error: "no such shop" });
          return send(response, 200, shop);
        }

        /**
         * What the app handed to the image host, in order.
         *
         * The only thing standing between a working upload and a silent
         * outage here is whether the app called the host at all with the bytes
         * it was given — which is exactly what went wrong when imgbb started
         * refusing datacenter IPs, and exactly what a mocked unit test cannot
         * see. Cleared by `/reset`, so an index is stable within one test.
         */
        if (path === "/image-uploads") {
          return send(response, 200, { uploads: getImageUploads() });
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
