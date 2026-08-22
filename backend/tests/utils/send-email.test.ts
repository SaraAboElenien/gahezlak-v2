import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The transport configuration for outbound mail.
 *
 * This is the path every signup depends on: without a verification email an
 * account can never be activated, so a misconfigured relay blocks registration
 * entirely. It is also the path most likely to break on a first deploy —
 * Gmail SMTP is routinely blocked from cloud-provider IP ranges, which is why
 * the provider became configurable.
 *
 * What makes it worth testing rather than eyeballing: a wrong transport does
 * not throw anywhere a user can see. `sendEmail` catches, returns `false`, and
 * three of its four callers ignore that boolean — so the failure surfaces as
 * "we sent you a code" and no email, forever.
 */

const createTransportMock = vi.hoisted(() => vi.fn());
const sendMailMock = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}));

const ENV_KEYS = [
  "sendEmail",
  "emailPassword",
  "SMTP_HOST",
  "SMTP_PORT",
  "EMAIL_FROM",
] as const;
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) original[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.clearAllMocks();
  vi.resetModules();
  sendMailMock.mockResolvedValue({ accepted: ["someone@example.com"] });
  createTransportMock.mockReturnValue({ sendMail: sendMailMock });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

const load = () => import("../../utils/send-email");

describe("sendEmail — transport selection", () => {
  it("defaults to Gmail when SMTP_HOST is unset", async () => {
    process.env.sendEmail = "owner@gmail.com";
    process.env.emailPassword = "app-password";
    const { sendEmail } = await load();

    await sendEmail("someone@example.com", "Subject", "<b>hi</b>");

    // Opting in must be required: an existing deployment that sets neither
    // variable has to keep behaving exactly as it did.
    expect(createTransportMock).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "owner@gmail.com", pass: "app-password" },
    });
  });

  it("uses an explicit SMTP host when one is configured", async () => {
    process.env.sendEmail = "8a1b2c@smtp-brevo.com";
    process.env.emailPassword = "smtp-key";
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    const { sendEmail } = await load();

    await sendEmail("someone@example.com", "Subject", "<b>hi</b>");

    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: { user: "8a1b2c@smtp-brevo.com", pass: "smtp-key" },
    });
  });

  it("treats port 465 as implicit TLS and anything else as STARTTLS", async () => {
    process.env.sendEmail = "u";
    process.env.emailPassword = "p";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    const { sendEmail } = await load();

    await sendEmail("someone@example.com", "Subject", "<b>hi</b>");

    // `secure` is derived rather than configured: as a separate variable it
    // would be wrong in exactly one combination, silently, with a TLS error
    // that names neither setting.
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
});

describe("sendEmail — sender identity", () => {
  it("falls back to the SMTP username, as Gmail requires", async () => {
    process.env.sendEmail = "owner@gmail.com";
    process.env.emailPassword = "app-password";
    const { sendEmail } = await load();

    await sendEmail("someone@example.com", "Subject", "<b>hi</b>");

    expect(sendMailMock.mock.calls[0][0].from).toContain("owner@gmail.com");
  });

  it("uses EMAIL_FROM when the login is not a usable sender address", async () => {
    // The Brevo case, and the reason this variable exists: the SMTP login is
    // `…@smtp-brevo.com` while the From must be a verified sender. Sending the
    // login as the From gets the message rejected outright.
    process.env.sendEmail = "8a1b2c@smtp-brevo.com";
    process.env.emailPassword = "smtp-key";
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.EMAIL_FROM = "no-reply@gahezlak.com";
    const { sendEmail } = await load();

    await sendEmail("someone@example.com", "Subject", "<b>hi</b>");

    const { from } = sendMailMock.mock.calls[0][0];
    expect(from).toContain("no-reply@gahezlak.com");
    expect(from).not.toContain("smtp-brevo.com");
  });
});

describe("sendEmail — failure reporting", () => {
  it("returns false instead of throwing when the relay rejects the message", async () => {
    process.env.sendEmail = "u";
    process.env.emailPassword = "p";
    sendMailMock.mockRejectedValue(new Error("535 Authentication failed"));
    const { sendEmail } = await load();

    await expect(
      sendEmail("someone@example.com", "Subject", "<b>hi</b>"),
    ).resolves.toBe(false);
  });

  it("returns false rather than throwing when credentials are absent", async () => {
    const { sendEmail } = await load();

    // REVERSED 2026-08-21, deliberately. This previously asserted a throw, on
    // the reasoning that "no credentials is a deployment mistake, not a
    // transient relay problem" and must be loud. The reasoning still holds —
    // the mechanism was the problem.
    //
    // getTransporter() throws synchronously and was called OUTSIDE this
    // function's try block, so sendEmail rejected despite its Promise<boolean>
    // signature. That happened mid-request, after signUp had already written
    // the user row: the caller got a 500 while a half-activated account existed
    // that the person could neither verify nor re-register with. Being loud
    // cost more than being silent did.
    //
    // The loudness moved to boot instead — config/env-validation.ts warns once,
    // at startup, where an operator can act on it and nobody is halfway through
    // a signup. Here the boolean is the single failure channel, and the error is
    // logged with its cause.
    await expect(
      sendEmail("someone@example.com", "Subject", "<b>hi</b>"),
    ).resolves.toBe(false);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
