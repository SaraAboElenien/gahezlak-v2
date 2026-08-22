/**
 * A minimal SMTP server that accepts everything and delivers nothing.
 *
 * The backend sends a verification code by email during signup, and there is
 * no env var that turns that off. Three options were available:
 *
 *   - leave the credentials unset — `utils/send-email.ts` throws from
 *     `getTransporter()`, which is OUTSIDE its own try/catch, so `sendEmail`
 *     rejects rather than resolving `false`. Whether signup survives that then
 *     depends on whether its caller happens to keep a `.catch()` on the call,
 *     which is not a property a test suite should be balanced on top of;
 *   - point SMTP at a closed port — better (nodemailer's connection error IS
 *     caught, so `sendEmail` resolves `false`), but it exercises the app's
 *     mail-failure path on every signup, which is not what production does;
 *   - accept the mail. That is this file, and it is the only one of the three
 *     where the app behaves exactly as it does in production.
 *
 * Just enough of RFC 5321 for nodemailer's client. Deliberately does NOT
 * advertise STARTTLS: nodemailer would try to upgrade, and there is no
 * certificate here. Messages are kept in memory so a spec could assert on one,
 * though the suite reads the OTP out of the database instead — simpler, and it
 * proves the code the app actually stored rather than one it happened to send.
 */
import { createServer, type Server, type Socket } from "node:net";

export interface CapturedMail {
  from: string;
  to: string[];
  data: string;
  at: number;
}

const mailbox: CapturedMail[] = [];

export function getMail(): readonly CapturedMail[] {
  return mailbox;
}

export function clearMail(): void {
  mailbox.length = 0;
}

function handleConnection(socket: Socket): void {
  let buffer = "";
  let inData = false;
  let dataLines = "";
  let from = "";
  let to: string[] = [];
  /** Set after AUTH ... so the follow-up base64 line is not parsed as a verb. */
  let expectingAuthLine = false;

  const write = (line: string) => socket.write(`${line}\r\n`);

  write("220 e2e-smtp-sink ESMTP ready");

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    for (;;) {
      if (inData) {
        const terminator = buffer.indexOf("\r\n.\r\n");
        if (terminator === -1) return;
        dataLines += buffer.slice(0, terminator);
        buffer = buffer.slice(terminator + 5);
        inData = false;
        mailbox.push({ from, to, data: dataLines, at: Date.now() });
        dataLines = "";
        from = "";
        to = [];
        write("250 2.0.0 Ok: queued as e2e");
        continue;
      }

      const lineEnd = buffer.indexOf("\r\n");
      if (lineEnd === -1) return;
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);

      if (expectingAuthLine) {
        expectingAuthLine = false;
        write("235 2.7.0 Authentication successful");
        continue;
      }

      const verb = line.split(" ")[0].toUpperCase();

      switch (verb) {
        case "EHLO":
          // One capability per line, last line uses a space instead of a dash.
          write("250-e2e-smtp-sink");
          write("250-AUTH PLAIN LOGIN");
          write("250 8BITMIME");
          break;
        case "HELO":
          write("250 e2e-smtp-sink");
          break;
        case "AUTH":
          if (/^AUTH\s+PLAIN\s+\S/i.test(line)) {
            // Credentials came inline; nothing further to wait for.
            write("235 2.7.0 Authentication successful");
          } else {
            // LOGIN (or bare PLAIN) — the client sends base64 on the next line.
            expectingAuthLine = true;
            write("334 VXNlcm5hbWU6");
          }
          break;
        case "MAIL":
          from = line.slice(line.indexOf(":") + 1).trim();
          write("250 2.1.0 Ok");
          break;
        case "RCPT":
          to.push(line.slice(line.indexOf(":") + 1).trim());
          write("250 2.1.5 Ok");
          break;
        case "DATA":
          inData = true;
          write("354 End data with <CR><LF>.<CR><LF>");
          break;
        case "RSET":
          from = "";
          to = [];
          write("250 2.0.0 Ok");
          break;
        case "NOOP":
          write("250 2.0.0 Ok");
          break;
        case "QUIT":
          write("221 2.0.0 Bye");
          socket.end();
          return;
        default:
          write("250 2.0.0 Ok");
          break;
      }
    }
  });

  // A client that disappears mid-session is normal here; never take the
  // harness down for it.
  socket.on("error", () => undefined);
}

export function createSmtpSink(): Server {
  const server = createServer(handleConnection);
  server.on("error", (error) => {
    console.error("[e2e] smtp sink error:", error);
  });
  return server;
}
