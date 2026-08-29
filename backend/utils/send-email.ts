import { createTransport, SendMailOptions, Transporter } from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";
import { logger } from "../config/pino";

/**
 * The transporter is built on first use rather than at module load.
 *
 * This used to read the credentials and `throw` at module scope, which meant
 * merely *importing* anything downstream of it (auth.service → auth.controller
 * → app.ts) crashed the whole process when the vars were unset. In a serverless
 * deployment that surfaces as an opaque FUNCTION_INVOCATION_FAILED on every
 * route, including routes that never send an email — the same eager-init
 * mistake already fixed in services/ai/* (see TECH_DEBT.md), where
 * config/openai.ts's deliberately-lazy client was being defeated by a static
 * class field.
 *
 * Failing lazily keeps the fail-fast guarantee where it actually matters — an
 * attempt to send mail without credentials still throws loudly — without
 * letting an optional integration take the entire API down.
 */
let cachedTransporter: Transporter | null = null;

/**
 * The SMTP credentials were originally named `sendEmail` / `emailPassword` —
 * the last two lowercase env vars in the backend, and confusingly named on top
 * of it (`sendEmail` is also this module's export). They are now `SMTP_USER` /
 * `SMTP_PASSWORD`, matching `SMTP_HOST` and `SMTP_PORT` beside them.
 *
 * The old names are still read as a fallback ON PURPOSE. These values live in
 * the hosting platform's dashboard, not in the repository, so a hard rename
 * breaks outbound mail the moment it deploys and stays broken until someone
 * notices — and the symptom of broken mail here is a successful-looking signup
 * with no email, which is precisely the failure this project has already spent
 * a session chasing. The fallback makes the code change deployable on its own,
 * and the deprecation warning is what tells the operator there is still
 * something to do.
 *
 * REMOVE THE FALLBACK once the platform environment is confirmed renamed.
 */
const LEGACY_ENV_NAMES = {
  SMTP_USER: "sendEmail",
  SMTP_PASSWORD: "emailPassword",
} as const;

let legacyEnvWarned = false;

function readSmtpCredential(name: keyof typeof LEGACY_ENV_NAMES) {
  const current = process.env[name];
  if (current) return current;

  const legacyName = LEGACY_ENV_NAMES[name];
  const legacy = process.env[legacyName];
  if (legacy && !legacyEnvWarned) {
    // Warned once per process rather than per message: a busy relay would
    // otherwise bury every other log line under a notice nobody can act on
    // from inside a request.
    legacyEnvWarned = true;
    logger.warn(
      { legacyName, replacement: name },
      `Email is configured through the deprecated env var "${legacyName}". ` +
        `Rename it to "${name}" in the hosting environment; the fallback will be removed.`,
    );
  }
  return legacy;
}

const getTransporter = (): { transporter: Transporter; from: string } => {
  // Read at call time, not module load, so the check reflects the environment
  // as it actually is when mail is sent.
  const user = readSmtpCredential("SMTP_USER");
  const pass = readSmtpCredential("SMTP_PASSWORD");

  if (!user || !pass) {
    throw new Error("Email credentials are not set in environment variables.");
  }

  const host = process.env.SMTP_HOST?.trim();

  /**
   * The address recipients see, which is **not** always the SMTP username.
   *
   * On Gmail they are the same address, which is why this used to interpolate
   * the username directly. On a transactional provider they are usually
   * different — Brevo logs in as something like `xxxxx@smtp-brevo.com` but
   * requires the From to be a sender you have verified, and rejects the
   * message outright otherwise. Defaults to the username so existing Gmail
   * configuration behaves exactly as before.
   */
  const from = process.env.EMAIL_FROM?.trim() || user;

  if (!cachedTransporter) {
    cachedTransporter = createTransport(
      host
        ? {
            host,
            port: Number(process.env.SMTP_PORT) || 587,
            // 465 is implicit TLS; 587 is STARTTLS, which nodemailer upgrades
            // to on its own. Deriving this from the port avoids a third
            // variable that is wrong in exactly one combination.
            secure: (Number(process.env.SMTP_PORT) || 587) === 465,
            auth: { user, pass },
          }
        : // No SMTP_HOST: keep the original Gmail behaviour, so nothing
          // changes for a deployment that has not opted in.
          { service: "gmail", auth: { user, pass } },
    );
  }

  return { transporter: cachedTransporter, from };
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments: Attachment[] = [],
): Promise<boolean> => {
  const wrappedHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 30px;">
      <div style="max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px 24px;">
        <h2 style="color: #2d7ff9; text-align: center; margin-bottom: 24px;">Welcome to Gahezlak!</h2>
        <div style="font-size: 16px; color: #222; margin-bottom: 24px;">
          ${html}
        </div>
        <div style="text-align: center; color: #888; font-size: 13px; margin-top: 32px;">
          If you did not request this, please ignore this email.<br/>
          &copy; ${new Date().getFullYear()} Gahezlak
        </div>
      </div>
    </div>
  `;

  try {
    // Inside the try, deliberately. getTransporter() THROWS when the email
    // credentials are unset — which is the normal state in local development
    // and the likely state of a half-configured deploy. Called outside, it made
    // this function reject despite its `Promise<boolean>` signature, so every
    // caller that reasonably trusted that signature inherited an exception it
    // never handled: an unconfigured mail transport turned a valid signup into
    // a 500 with the user row already written.
    //
    // The boolean is the single failure channel. This function does not throw.
    const { transporter, from } = getTransporter();

    const mailOptions: SendMailOptions = {
      from: `"Gahezlak" <${from}>`,
      to,
      subject,
      html: wrappedHtml,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);

    return (
      info.accepted && Array.isArray(info.accepted) && info.accepted.length > 0
    );
  } catch (error) {
    // The full error, not just `error.name` — which logged the literal
    // string "Error" and told you nothing. This log is the operator's signal
    // that mail is failing. It matters because the three auth callers
    // deliberately do not change their response when a send fails: two of them
    // (resend-verification, forgot-password) must stay generic to avoid
    // becoming account-enumeration oracles, so a blocked relay would otherwise
    // look exactly like a successful signup with no email ever arriving.
    logger.error({ err: error, to, subject }, "sendEmail failed");
    return false;
  }
};
