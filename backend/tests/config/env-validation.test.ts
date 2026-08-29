import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `config/env-validation.ts` self-executes `validateEnv()` on import (see the
 * long note at the bottom of that file for why it must), so every case here
 * needs `vi.resetModules()` plus a fresh dynamic import to re-run it under
 * different env conditions.
 *
 * The webhook cases are the reason this file exists. An unset
 * ORDER_WEBHOOK_URL is not a broken feature that reports itself: Paymob is
 * sent `notification_url: undefined`, calls nobody, and a genuinely paid order
 * stays `Pending` forever while the customer's card is charged. There is no
 * error, no log line and no failing request anywhere in that sequence — the
 * boot warning is the only moment it is observable, which makes the warning
 * itself the thing worth pinning down.
 */

const WEBHOOK_VARS = ["ORDER_WEBHOOK_URL", "SUBSCRIPTION_WEBHOOK_URL"] as const;
const REQUIRED_VARS = ["MONGODB_URI", "JWT_SECRET", "FRONTEND_URL"] as const;

describe("config/env-validation", () => {
  const saved: Record<string, string | undefined> = {};
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    for (const k of [...WEBHOOK_VARS, ...REQUIRED_VARS])
      saved[k] = process.env[k];
    // The required three must be present or the module throws before it ever
    // reaches the warnings under test.
    for (const k of REQUIRED_VARS) process.env[k] = process.env[k] || "x";
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    warn.mockRestore();
  });

  const warnings = () =>
    warn.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

  it("warns, naming the variable, when ORDER_WEBHOOK_URL is unset", async () => {
    delete process.env.ORDER_WEBHOOK_URL;
    process.env.SUBSCRIPTION_WEBHOOK_URL = "https://api.example.com/hook";

    await import("../../config/env-validation");

    const text = warnings();
    expect(text).toContain("ORDER_WEBHOOK_URL");
    expect(text).not.toContain("SUBSCRIPTION_WEBHOOK_URL");
    // The operator reading this needs the consequence, not just the name.
    expect(text).toMatch(/Pending/);
  });

  it("warns when SUBSCRIPTION_WEBHOOK_URL is unset", async () => {
    process.env.ORDER_WEBHOOK_URL = "https://api.example.com/hook";
    delete process.env.SUBSCRIPTION_WEBHOOK_URL;

    await import("../../config/env-validation");

    expect(warnings()).toContain("SUBSCRIPTION_WEBHOOK_URL");
  });

  it("names both when both are unset", async () => {
    for (const k of WEBHOOK_VARS) delete process.env[k];

    await import("../../config/env-validation");

    const text = warnings();
    for (const k of WEBHOOK_VARS) expect(text).toContain(k);
  });

  it("stays silent about webhooks when both are set", async () => {
    for (const k of WEBHOOK_VARS)
      process.env[k] = "https://api.example.com/hook";

    await import("../../config/env-validation");

    expect(warnings()).not.toMatch(/Paymob webhooks/);
  });

  it("warns rather than throwing, so a missing webhook URL cannot stop boot", async () => {
    for (const k of WEBHOOK_VARS) delete process.env[k];

    // The whole design choice: degraded, not down. A throw here would take the
    // API offline over a variable that is legitimately absent in local dev.
    await expect(import("../../config/env-validation")).resolves.toBeDefined();
  });

  it("still throws when a genuinely required variable is missing", async () => {
    delete process.env.JWT_SECRET;

    await expect(import("../../config/env-validation")).rejects.toThrow(
      /JWT_SECRET/,
    );
  });

  /**
   * The email credentials are readable under two names. `SMTP_USER` /
   * `SMTP_PASSWORD` are the real ones; `sendEmail` / `emailPassword` are the
   * originals, still honoured because they are what is set in the live Render
   * dashboard — renaming in code alone would have broken production mail on
   * deploy.
   *
   * That fallback creates a trap this block exists to close: a check written
   * against only the new names prints "Email is not configured" at every boot
   * while mail works perfectly. A false alarm in a boot warning is worse than
   * no warning, because the next real one gets ignored too.
   */
  const EMAIL_VARS = [
    "SMTP_USER",
    "SMTP_PASSWORD",
    "sendEmail",
    "emailPassword",
  ] as const;

  function clearEmailVars() {
    for (const k of EMAIL_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  }

  it("stays silent about email when only the CURRENT names are set", async () => {
    clearEmailVars();
    process.env.SMTP_USER = "relay-user";
    process.env.SMTP_PASSWORD = "relay-secret";

    await import("../../config/env-validation");

    expect(warnings()).not.toMatch(/Email is not configured/);
  });

  it("stays silent about email when only the LEGACY names are set", async () => {
    // The live production state today. This is the case that would have
    // regressed into a permanent false warning.
    clearEmailVars();
    process.env.sendEmail = "relay-user";
    process.env.emailPassword = "relay-secret";

    await import("../../config/env-validation");

    expect(warnings()).not.toMatch(/Email is not configured/);
  });

  it("warns naming the CURRENT variable when a credential is missing under both names", async () => {
    clearEmailVars();
    // The password is present under the legacy name; the user is absent
    // entirely, so exactly one credential is genuinely missing.
    process.env.emailPassword = "relay-secret";

    await import("../../config/env-validation");

    const text = warnings();
    expect(text).toMatch(/Email is not configured/);
    // Names the credential an operator should now set, not the deprecated one.
    expect(text).toContain("SMTP_USER");
    expect(text).not.toContain("SMTP_PASSWORD");
  });
});
