// Must be the first import, full stop: env-validation.ts validates and
// throws (naming exactly what's missing) as a side effect of being
// imported, not via a function call below — a call placed between two
// `import` lines here would still run after every import's own side
// effects (e.g. middlewares/auth.ts's JWT_SECRET check), since import
// declarations are evaluated in source order before this module's own
// top-level statements, regardless of where a plain statement sits in the
// source. Importing this first, before Sentry/db/routes/etc., is what
// actually guarantees the check runs before anything else does.
import "./config/env-validation";

// Must be the first import after env validation: Sentry.init() (config/sentry.ts)
// needs to run before anything else so it can capture errors from every module below.
import { captureException } from "./config/sentry";
import express from "express";
import mongoose from "mongoose";
import { httpLogger, logger } from "./config/pino";
import { resolveTrustProxyHops } from "./config/trust-proxy";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import adminRoutes from "./routes/admin.routes";
import reportRoutes from "./routes/report.routes";
// import http from "http";
// import { initSocket } from "./sockets/socketServer";
import { ErrorHandlerMiddleware } from "./middlewares/error-handling.middleware";
import { languageMiddleware } from "./middlewares/language.middleware";
import planRoutes from "./routes/plan.routes";
// import paymentRoutes from "./routes/payment.routes";
import shopRoutes from "./routes/shop.routes";
import roleRoutes from "./routes/role.routes";
import { aiMenuRoutes } from "./routes/ai-menu.routes";

import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { errMsg } from "./common/err-messages";
import { Errors } from "./errors";
import webhooksRoutes from "./routes/webhooks.routes";

// Previously nothing caught these at all — an unhandled rejection or a sync
// throw outside Express's request cycle just crashed the process with no log
// context and no Sentry report, leaving only an unexplained restart.
process.on("uncaughtException", (err) => {
  logger.error(err, "uncaughtException");
  captureException(err);
});
process.on("unhandledRejection", (reason) => {
  logger.error(reason, "unhandledRejection");
  captureException(reason);
});

const app = express();

// MUST be set before any middleware that reads req.ip -- notably the rate
// limiters, which key on it. Without this Express reports Render's local
// proxy (127.0.0.1) as every client's address, so every user in the world
// shared a single rate-limit bucket. See config/trust-proxy.ts for the
// observed hop chain and for why this is a hop COUNT and never `true`.
app.set("trust proxy", resolveTrustProxyHops());

// Allowed browser origins for CORS. FRONTEND_URL must be set to the real
// deployed frontend origin in production; localhost is only allowed outside
// production so local dev works without extra config.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:5173", "http://localhost:4173"]
    : []),
].filter((origin): origin is string => Boolean(origin));

app.use(helmet());
app.use(
  cors({
    // This callback is load-bearing for CSRF, not just CORS — do not
    // "simplify" it to `origin: allowedOrigins`.
    //
    // Passing an array makes the cors package merely *omit* the response
    // headers for a disallowed origin: the request still reaches the handler
    // and its side effects still happen, which is the usual and correct
    // caveat that CORS is not a CSRF defence. Rejecting here instead means
    // the request is refused before routing, which makes this a genuine
    // server-side origin check. That is what stops a third-party page from
    // force-submitting the httpOnly refresh cookie to POST /auth/refresh or
    // /auth/signout — those two act on the cookie alone, need no body, and in
    // production the cookie must be SameSite=None (different origins), so
    // SameSite cannot stop it either.
    //
    // Pinned by tests/routes/auth-csrf.routes.test.ts.
    origin: (origin, callback) => {
      // Requests with no Origin header (server-to-server calls, webhooks,
      // curl/Postman) aren't subject to CORS and are always allowed through.
      // This is not a CSRF hole: an attack of that kind requires a browser,
      // and browsers always attach Origin to a cross-site POST. A client that
      // sends none has no cookie jar to be exploited through.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Errors.NotAllowedError(errMsg.NOT_ALLOWED_ACTION));
      }
    },
    // Required so the browser sends/stores the httpOnly refresh-token cookie
    // (config/cookies.ts) on cross-origin auth calls. Safe with the callback
    // above: passing `true` to it makes the cors package *reflect* the
    // request's Origin header, it never emits `Access-Control-Allow-Origin: *`
    // (which the browser would reject outright alongside credentials).
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(httpLogger);
app.use(languageMiddleware);

// const server = http.createServer(app);
// initSocket(server);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Lightweight readiness check: mongoose.connection.readyState is 1 only when
// actually connected, so this doesn't need to round-trip a real DB query.
app.get("/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;

  if (dbConnected) {
    res.status(200).json({ status: "ok", db: "connected" });
  } else {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/v1/webhooks", webhooksRoutes);

app.use("/api/v1/plans", planRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
// app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/shops", shopRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/ai/menu", aiMenuRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/reports", reportRoutes);

// Catch-all for unmatched routes. Declared with no parameters on purpose:
// Express only treats a handler as an error handler when its arity is
// exactly 4, so a zero-arg function is still a normal middleware.
app.use(() => {
  throw new Errors.NotFoundError(errMsg.ROUTE_NOT_FOUND);
});

app.use(ErrorHandlerMiddleware);

// Importing this module deliberately acquires nothing: no database
// connection, no bound port. (It does install the process-level error handlers
// above, which is intentional — they have to be in place before anything else
// can throw — but that holds no resource.) Starting the process is
// `server.ts`'s job. Keeping the two separate is what lets tests (and
// supertest) import the fully-wired app without a live database or a bound
// port, and it means an accidental import from a script can never start a
// server.
export default app;
