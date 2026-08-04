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

const getTransporter = (): { transporter: Transporter; user: string } => {
  // Read at call time, not module load, so the check reflects the environment
  // as it actually is when mail is sent.
  const user = process.env.sendEmail;
  const pass = process.env.emailPassword;

  if (!user || !pass) {
    throw new Error("Email credentials are not set in environment variables.");
  }

  if (!cachedTransporter) {
    cachedTransporter = createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  return { transporter: cachedTransporter, user };
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments: Attachment[] = [],
): Promise<boolean> => {
  const { transporter, user } = getTransporter();

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

  const mailOptions: SendMailOptions = {
    from: `"Gahezlak 👻" <${user}>`,
    to,
    subject,
    html: wrappedHtml,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    return (
      info.accepted && Array.isArray(info.accepted) && info.accepted.length > 0
    );
  } catch (error) {
    if (error instanceof Error) {
      logger.error(error.name);
    } else {
      logger.error("Unknown error occurred in sendEmail");
    }
    return false;
  }
};
