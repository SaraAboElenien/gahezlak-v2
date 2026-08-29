import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { compare } from "bcryptjs";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { logger } from "../../config/pino";
import type { IUser } from "../../models/User";

/**
 * Service-level coverage for the auth path — registration, login, OTP
 * verification, password reset, token issuance and rotation.
 *
 * This is the largest service in the codebase and had no tests at all. Every
 * failure mode here costs either account access (a legitimate user locked out)
 * or unauthorised access (someone let in who shouldn't be), and most of them
 * fail *silently*: a password stored in plaintext, a consumed OTP that still
 * works, a rotated refresh token that wasn't really invalidated, and an error
 * message that quietly tells an attacker which emails are registered all look
 * identical to a working system from the outside.
 *
 * Deliberately NOT mocked: bcrypt, jsonwebtoken and Mongo. The point of these
 * tests is that real hashing, real signing and real persistence do what the
 * service claims. Only the email boundary is stubbed.
 *
 * tests/middlewares/auth.test.ts covers `protect`/`isAllowed` (token
 * *consumption*); this file covers token *issuance* and the credential store.
 */

// setup.ts (a vitest setupFile, so it has already run) sets these, but
// config/bcrypt reads BCRYPT_SALT_ROUNDS at module-load time and auth.service
// reads JWT_SECRET on every sign/verify — pin them here so this file does not
// depend on hook ordering or on another file's defaults.
process.env.JWT_SECRET ??= "test-jwt-secret";
const JWT_SECRET = process.env.JWT_SECRET;

// The only external boundary. sendEmail() throws when SMTP credentials are
// unset, so without this every OTP-issuing path would fail for the wrong
// reason — and a real message could be sent if a .env ever leaked into a run.
// The stub keeps utils/send-email.ts's lazy-transporter contract intact: the
// module is never loaded, so nothing is evaluated at import time.
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/send-email", () => ({ sendEmail: sendEmailMock }));

const PASSWORD = "CorrectHorse1!";
const OTHER_PASSWORD = "TotallyDifferent9!";
const EMAIL = "owner@example.com";

type CapturedError = Error & { statusCode?: number; code?: number };

/**
 * Awaits a call that is expected to reject and hands back the error itself, so
 * a test can compare two failures against each other rather than only asserting
 * "it threw". Fails loudly if the call resolves — an auth check that silently
 * stops rejecting is exactly the regression worth catching.
 */
async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
  try {
    await promise;
  } catch (err) {
    return err as CapturedError;
  }
  throw new Error("expected the call to reject, but it resolved");
}

async function seedUserRole() {
  const { Roles, Role } = await import("../../models/Role");
  return Roles.create({ name: Role.USER, permissions: [] });
}

async function register(email = EMAIL, password = PASSWORD) {
  const { signUp } = await import("../../services/auth.service");
  return signUp({
    firstName: "Test",
    lastName: "User",
    email,
    password,
    phoneNumber: "01000000000",
  });
}

/** Reads the raw stored document, including the `select: false` password. */
async function storedUser(email = EMAIL) {
  const { Users } = await import("../../models/User");
  const user = await Users.findOne({ email: email.toLowerCase() })
    .select("+password")
    .lean();
  if (!user) throw new Error(`test setup: no user for ${email}`);
  return user;
}

/** Registers a user and consumes their signup OTP, leaving them verified. */
async function registerAndVerify(email = EMAIL, password = PASSWORD) {
  const { verifyCode } = await import("../../services/auth.service");
  await register(email, password);
  const created = await storedUser(email);
  const tokens = await verifyCode({
    email,
    code: created.verificationCode.code!,
    reason: "account_verification",
  });
  return { ...tokens, userId: created._id.toString() };
}

/**
 * The three OTP flows each own a slot on the user document (see models/User.ts).
 * Tests name the slot they mean rather than assuming one shared field — the
 * whole point of the split is that writing one must not disturb the others.
 */
type OtpSlotName = "verificationCode" | "passwordResetCode" | "emailChangeCode";

async function expireStoredCode(
  email = EMAIL,
  slot: OtpSlotName = "verificationCode",
) {
  const { Users } = await import("../../models/User");
  await Users.updateOne(
    { email: email.toLowerCase() },
    { $set: { [`${slot}.expireAt`]: new Date(Date.now() - 1000) } },
  );
}

function decode(token: string) {
  return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload &
    Record<string, unknown>;
}

beforeAll(async () => {
  await connectTestDB();
  const { Users } = await import("../../models/User");
  // findUserByEmail populates "shop"; the model has to be registered or
  // mongoose throws MissingSchemaError instead of running the query.
  await import("../../models/Shop");
  // Build the unique index on users.email up front. Mongoose builds it in the
  // background, so without this the duplicate-registration test can race the
  // build and pass for the wrong reason (or fail intermittently).
  await Users.init();
});

afterAll(async () => {
  await disconnectTestDB();
});

let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue(true);
  // See ADR-016: sendEmail() never throws, so a failed send is only
  // observable via its boolean return and this log line. Spying here — not
  // just asserting on the account/response — is what makes the "still reads
  // the boolean" regression tests below actually catch a caller that goes
  // back to discarding it.
  loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
  await seedUserRole();
});

afterEach(() => {
  loggerErrorSpy.mockRestore();
});

describe("signUp", () => {
  it("hashes the password and never stores the plaintext", async () => {
    await register();

    const user = await storedUser();

    // The three independent ways this can go wrong: stored verbatim, stored
    // under something that isn't bcrypt, or stored as a hash the login path
    // can't actually verify against.
    expect(user.password).not.toBe(PASSWORD);
    expect(user.password).toMatch(/^\$2[aby]\$/);
    await expect(compare(PASSWORD, user.password)).resolves.toBe(true);
    await expect(compare(OTHER_PASSWORD, user.password)).resolves.toBe(false);
  });

  it("keeps the password out of ordinary queries", async () => {
    const { Users } = await import("../../models/User");
    await register();

    // `select: false` on the schema is what stops the hash leaking through
    // every unrelated findOne/populate in the app. Losing it would not break
    // a single feature, so nothing else would notice.
    const user = await Users.findOne({ email: EMAIL }).lean();
    expect(user?.password).toBeUndefined();
  });

  it("stores an unverified user with a 10-minute account_verification code", async () => {
    const before = Date.now();
    await register("Owner@Example.COM");

    const user = await storedUser("owner@example.com");

    // The email is lower-cased on write; every later lookup lower-cases too,
    // so a mismatch here would make an account permanently unreachable.
    expect(user.email).toBe("owner@example.com");
    expect(user.isVerified).toBe(false);
    expect(user.refreshToken).toBe("");
    expect(user.verificationCode.code).toHaveLength(6);
    expect(user.verificationCode.reason).toBe("account_verification");
    const ttl = new Date(user.verificationCode.expireAt!).getTime() - before;
    expect(ttl).toBeGreaterThan(9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it("emails the same code it stored", async () => {
    await register();

    const user = await storedUser();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [to, , html] = sendEmailMock.mock.calls[0] as string[];
    expect(to.toLowerCase()).toBe(EMAIL);
    // A code that is stored but not sent (or vice versa) locks the user out of
    // their brand-new account with no error anywhere.
    expect(html).toContain(user.verificationCode.code);
  });

  it("rejects a second registration for the same email, whatever its casing", async () => {
    await register("Dupe@Example.com");

    const err = await captureError(register("dupe@example.com"));

    // Enforced by the unique index rather than an explicit check, which is why
    // the lower-casing above is load-bearing: without it "Dupe@" and "dupe@"
    // would be two distinct index entries and two accounts for one mailbox.
    expect(err.code).toBe(11000);
    const { Users } = await import("../../models/User");
    await expect(Users.countDocuments()).resolves.toBe(1);
  });

  it("refuses to register when the roles collection has not been seeded", async () => {
    const { Roles } = await import("../../models/Role");
    const { Errors } = await import("../../errors");
    await Roles.deleteMany({});

    const err = await captureError(register());

    // This has bitten the project for real: an empty `roles` collection blocks
    // registration entirely. The half-created-user variant would be worse, so
    // assert nothing was written and no email went out.
    expect(err).toBeInstanceOf(Errors.NotFoundError);
    const { Users } = await import("../../models/User");
    await expect(Users.countDocuments()).resolves.toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still creates the account when the verification email fails to send", async () => {
    // `false`, not a rejection: sendEmail's signature is Promise<boolean> and
    // it catches its own errors. An earlier version of this test mocked a
    // rejection, which meant it was asserting against behaviour the real
    // function does not have — and it kept passing only because the caller
    // carried a `.catch(console.error)` that could never fire.
    sendEmailMock.mockResolvedValue(false);

    await expect(register()).resolves.toBeDefined();

    // Deliberate: a mail outage must not roll back a valid registration. The
    // account is recoverable via resend-verification-code, whereas deleting the
    // row would discard the user's password over a transient relay failure.
    const user = await storedUser();
    expect(user.verificationCode.code).toHaveLength(6);
  });

  it("reports a failed verification email to the caller, not only to the log", async () => {
    // The operator-facing log line below is necessary but not sufficient: the
    // person who just registered is told "check your email" for an inbox that
    // will never receive anything, so they wait, check spam, and conclude the
    // product is broken — while the unverified row blocks them from
    // re-registering the same address. The flag is what lets the response say
    // "press Resend" instead.
    sendEmailMock.mockResolvedValue(false);

    await expect(register()).resolves.toEqual({
      verificationEmailSent: false,
    });
  });

  it("reports a successful verification email as sent", async () => {
    // Control for the test above: the flag has to distinguish the two
    // outcomes, not merely exist. A flag that is always false would satisfy
    // the failure assertion on its own.
    await expect(register()).resolves.toEqual({
      verificationEmailSent: true,
    });
  });

  // Enumeration boundary, stated as a test because the reasoning is easy to
  // lose. `signUp` may branch its response on delivery ONLY because it already
  // discloses whether an address is registered — a duplicate registration
  // throws a unique-index error. `resendVerificationCode` and `forgotPassword`
  // deliberately do the opposite (see their own tests): they are reachable
  // unauthenticated for any address, so a response that varied with delivery
  // would rebuild the account-enumeration oracle those endpoints were changed
  // to close, since mail is only ever sent for addresses that exist.
  it("does not let the resend endpoint branch its answer on delivery", async () => {
    const { resendVerificationCode } =
      await import("../../services/auth.service");
    await register();

    sendEmailMock.mockResolvedValue(true);
    const delivered = await resendVerificationCode({ email: EMAIL });
    sendEmailMock.mockResolvedValue(false);
    const undelivered = await resendVerificationCode({ email: EMAIL });

    expect(undelivered).toEqual(delivered);
  });

  it("does not let the forgot-password endpoint branch its answer on delivery", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();

    sendEmailMock.mockResolvedValue(true);
    const delivered = await forgotPassword({ email: EMAIL });
    sendEmailMock.mockResolvedValue(false);
    const undelivered = await forgotPassword({ email: EMAIL });

    expect(undelivered).toEqual(delivered);
  });

  // Regression for the silent-failure bug this file's header describes: a
  // blocked SMTP relay used to be indistinguishable from a working one,
  // because `.catch(console.error)` could never fire (sendEmail resolves
  // `false`, it does not reject) and nothing else read the boolean. If signUp
  // goes back to `await sendEmail(...)` without checking the result, this is
  // the only assertion in the suite that notices — the account/response
  // assertions above are unchanged either way, since the account is
  // deliberately never rolled back on a failed send. See ADR-016 and the
  // TECH_DEBT.md entry on why the *user* still isn't told (a separate,
  // deliberately open product decision — this test is only about the
  // operator-facing signal).
  it("logs an operator-facing error when the verification email fails to send", async () => {
    sendEmailMock.mockResolvedValue(false);

    await register();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL }),
      expect.stringMatching(/verification email failed to send/i),
    );
  });

  it("logs nothing when the verification email sends successfully", async () => {
    // sendEmailMock defaults to resolving `true` (see beforeEach). Symmetry
    // check for the test above: a healthy send must not also trip the
    // operator alert, or the signal would be meaningless noise.
    await register();

    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("issues tokens and persists the refresh token for correct credentials", async () => {
    const { login } = await import("../../services/auth.service");
    await registerAndVerify();

    const result = await login({ email: EMAIL, password: PASSWORD });

    expect(decode(result.accessToken).email).toBe(EMAIL);
    // The stored copy is what makes /auth/refresh work at all — refreshToken()
    // compares the presented token against it.
    const user = await storedUser();
    expect(user.refreshToken).toBe(result.refreshToken);
  });

  it("accepts the email in any casing", async () => {
    const { login } = await import("../../services/auth.service");
    await registerAndVerify();

    await expect(
      login({ email: "OWNER@EXAMPLE.COM", password: PASSWORD }),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it("never returns credentials or internal fields to the caller", async () => {
    const { login } = await import("../../services/auth.service");
    await registerAndVerify();

    const { user } = await login({ email: EMAIL, password: PASSWORD });

    // The password is fetched with `+password` for the compare, so it is
    // genuinely present on the object omitSensitiveUserFields() is handed —
    // this is the assertion standing between the hash and the wire.
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("refreshToken");
    expect(user).not.toHaveProperty("verificationCode");
    expect(user).not.toHaveProperty("role");
    expect(user).not.toHaveProperty("newEmail");
    expect(user).toMatchObject({ email: EMAIL, isVerified: true });
  });

  it("rejects a wrong password without issuing or persisting a token", async () => {
    const { login } = await import("../../services/auth.service");
    await registerAndVerify();
    const { Users } = await import("../../models/User");
    await Users.updateOne({ email: EMAIL }, { $set: { refreshToken: "" } });

    await captureError(login({ email: EMAIL, password: OTHER_PASSWORD }));

    // A failed login must leave no usable session behind.
    const user = await storedUser();
    expect(user.refreshToken).toBe("");
  });

  it("rejects an unknown email", async () => {
    const { login } = await import("../../services/auth.service");

    await captureError(
      login({ email: "ghost@example.com", password: PASSWORD }),
    );
  });

  it("refuses to log in an account that has not been verified", async () => {
    const { login } = await import("../../services/auth.service");
    const { Errors } = await import("../../errors");
    await register();

    const err = await captureError(login({ email: EMAIL, password: PASSWORD }));

    // Only reachable with the correct password: the verified check runs after
    // the password compare, so it cannot answer someone merely guessing at
    // addresses. See the enumeration test below.
    expect(err).toBeInstanceOf(Errors.UnauthenticatedError);
  });

  it("does not reveal that an account exists to someone with the wrong password", async () => {
    const { login } = await import("../../services/auth.service");
    const { Errors } = await import("../../errors");
    await register(); // registered, deliberately left unverified

    const err = await captureError(
      login({ email: EMAIL, password: OTHER_PASSWORD }),
    );

    // Not ACCOUNT_NOT_VERIFIED: replying "that account exists but isn't
    // verified" to a failed password attempt would reinstate the oracle the
    // test below closes.
    expect(err).toBeInstanceOf(Errors.UnauthorizedError);
  });

  // Regression: an unknown email used to fail inside findUserByEmail with
  // NotFoundError / USER_NOT_FOUND / 404 while a known email with a wrong
  // password failed with UnauthorizedError / INVALID_EMAIL_OR_PASSWORD / 403.
  // The two were trivially distinguishable by status code and body, making
  // /auth/login an oracle for "is this address registered here" — the input to
  // credential stuffing and targeted phishing.
  it("does not reveal whether an email is registered", async () => {
    const { login } = await import("../../services/auth.service");
    await registerAndVerify();

    const unknownEmail = await captureError(
      login({ email: "ghost@example.com", password: PASSWORD }),
    );
    const wrongPassword = await captureError(
      login({ email: EMAIL, password: OTHER_PASSWORD }),
    );

    expect(unknownEmail.constructor.name).toBe(wrongPassword.constructor.name);
    expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
    expect(unknownEmail.message).toBe(wrongPassword.message);
  });
});

describe("verifyCode", () => {
  it("marks the account verified, clears the code and persists a refresh token", async () => {
    const { verifyCode } = await import("../../services/auth.service");
    await register();
    const code = (await storedUser()).verificationCode.code!;

    const result = await verifyCode({
      email: EMAIL,
      code,
      reason: "account_verification",
    });

    const user = await storedUser();
    expect(user.isVerified).toBe(true);
    expect(user.verificationCode.code).toBeNull();
    expect(user.refreshToken).toBe(result.refreshToken);
    expect(decode(result.accessToken).userId).toBe(user._id.toString());
  });

  it("rejects a wrong code and leaves the account unverified", async () => {
    const { verifyCode } = await import("../../services/auth.service");
    const { Errors } = await import("../../errors");
    await register();

    const err = await captureError(
      verifyCode({
        email: EMAIL,
        code: "000000",
        reason: "account_verification",
      }),
    );

    expect(err).toBeInstanceOf(Errors.BadRequestError);
    const user = await storedUser();
    expect(user.isVerified).toBe(false);
    // The real code must survive a wrong guess, or one typo would lock the
    // user out of a code they still hold.
    expect(user.verificationCode.code).toHaveLength(6);
  });

  it("rejects an expired code and leaves the account unverified", async () => {
    const { verifyCode } = await import("../../services/auth.service");
    await register();
    const code = (await storedUser()).verificationCode.code!;
    await expireStoredCode();

    const err = await captureError(
      verifyCode({ email: EMAIL, code, reason: "account_verification" }),
    );

    // The 10-minute window is the only thing bounding how long a leaked or
    // shoulder-surfed code stays usable.
    expect(err.message).toMatch(/expired/i);
    expect((await storedUser()).isVerified).toBe(false);
  });

  it("cannot replay a code that has already been consumed", async () => {
    const { verifyCode } = await import("../../services/auth.service");
    await register();
    const code = (await storedUser()).verificationCode.code!;
    await verifyCode({ email: EMAIL, code, reason: "account_verification" });

    const err = await captureError(
      verifyCode({ email: EMAIL, code, reason: "account_verification" }),
    );

    // Consumption is implemented by nulling the stored code, so a replay must
    // land on "no code found" rather than minting a second session.
    expect(err.message).toMatch(/no verification code/i);
  });

  it("rejects a code presented with the wrong reason", async () => {
    const { verifyCode } = await import("../../services/auth.service");
    await register();
    const code = (await storedUser()).verificationCode.code!;

    const err = await captureError(
      verifyCode({ email: EMAIL, code, reason: "password_reset" }),
    );

    // Each flow now owns its slot, but the reason guard is kept as defence in
    // depth and this is what still rejects a caller that simply asks for the
    // wrong one against a perfectly valid code.
    expect(err.message).toMatch(/reason/i);
    expect((await storedUser()).isVerified).toBe(false);
  });

  // Regression: a password_reset OTP presented with reason "password_reset"
  // used to satisfy every check in verifyCode, so it minted a full access token
  // plus a 7-day refresh token and flipped isVerified to true — without the
  // holder ever setting a password. A reset code was therefore a login
  // credential, and the reset flow doubled as an email-verification bypass.
  // Least privilege: a reset code authorises resetPassword and nothing else.
  it("does not let a password-reset code be exchanged for a session", async () => {
    const { forgotPassword, verifyCode } =
      await import("../../services/auth.service");
    await register();
    await forgotPassword({ email: EMAIL });
    // The real reset code, read from the slot that now holds it. Reading the
    // old shared slot here would silently pick up the *signup* code instead
    // and the test would pass without exercising anything.
    const code = (await storedUser()).passwordResetCode.code!;

    // Rejected under either reason: "password_reset" fails VERIFIABLE_REASON,
    // and "account_verification" cannot find the code at all because it is not
    // in the slot this endpoint reads.
    await expect(
      verifyCode({ email: EMAIL, code, reason: "password_reset" }),
    ).rejects.toThrow();
    await expect(
      verifyCode({ email: EMAIL, code, reason: "account_verification" }),
    ).rejects.toThrow();
    expect((await storedUser()).isVerified).toBe(false);
  });
});

describe("resendVerificationCode", () => {
  it("replaces the previous code, so the old one stops working", async () => {
    const { resendVerificationCode, verifyCode } =
      await import("../../services/auth.service");
    await register();
    const firstCode = (await storedUser()).verificationCode.code!;

    await resendVerificationCode({ email: EMAIL });
    const secondCode = (await storedUser()).verificationCode.code!;

    expect(secondCode).not.toBe(firstCode);
    // Superseding the old code matters: otherwise every resend widens the set
    // of codes that unlock the account.
    await expect(
      verifyCode({
        email: EMAIL,
        code: firstCode,
        reason: "account_verification",
      }),
    ).rejects.toThrow();
    await expect(
      verifyCode({
        email: EMAIL,
        code: secondCode,
        reason: "account_verification",
      }),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it("silently does nothing for an account that is already verified", async () => {
    const { resendVerificationCode } =
      await import("../../services/auth.service");
    await registerAndVerify();
    sendEmailMock.mockClear(); // drop the signup email from the setup above
    const before = await storedUser();

    await resendVerificationCode({ email: EMAIL });

    // The protection is unchanged and is what these two assertions pin: an
    // unauthenticated caller must not be able to write a fresh OTP onto a live
    // account, nor keep mailing one out. Only the *answer* changed — see the
    // enumeration test below for why it can no longer say "already verified".
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect((await storedUser()).verificationCode.code).toBe(
      before.verificationCode.code,
    );
  });

  it("does not reveal whether an email is registered, or its verification state", async () => {
    const { resendVerificationCode } =
      await import("../../services/auth.service");
    await register(); // registered, not yet verified — the one real case
    await registerAndVerify("already.verified@example.com");

    const unverified = await resendVerificationCode({ email: EMAIL });
    const verified = await resendVerificationCode({
      email: "already.verified@example.com",
    });
    const unknown = await resendVerificationCode({
      email: "ghost@example.com",
    });

    // Three different internal outcomes, one indistinguishable answer. These
    // used to be 200, 400 USER_ALREADY_VERIFIED and 404 USER_NOT_FOUND, which
    // handed an anonymous caller both a membership check and each account's
    // verification state.
    expect(verified).toEqual(unverified);
    expect(unknown).toEqual(unverified);
  });
});

describe("forgotPassword", () => {
  it("stores a 10-minute password_reset code and emails it", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    const before = Date.now();

    await forgotPassword({ email: EMAIL });

    const user = await storedUser();
    // `passwordResetCode`, not the shared slot this used to write: a reset must
    // not land in the account-verification slot, where verifyCode could see it.
    expect(user.passwordResetCode.reason).toBe("password_reset");
    expect(user.passwordResetCode.code).toHaveLength(6);
    const ttl = new Date(user.passwordResetCode.expireAt!).getTime() - before;
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    const calls = sendEmailMock.mock.calls;
    // Indexed rather than `.at(-1)`: the backend targets ES2020, where `.at`
    // is not in lib.
    const [, , html] = calls[calls.length - 1] as string[];
    expect(html).toContain(user.passwordResetCode.code);
  });

  it("does not disturb an account-verification code that is still outstanding", async () => {
    // The bug the slot split exists to fix. All three OTP flows used to write
    // one `verificationCode` sub-document, so asking for a password reset
    // silently destroyed the signup code the same person was at that moment
    // reading out of their inbox — and the natural response, requesting
    // another, is what caused it. Nothing told them, and the symptom reads as
    // a mail-delivery problem.
    const { forgotPassword, verifyCode } =
      await import("../../services/auth.service");
    await register();
    const signupCode = (await storedUser()).verificationCode.code!;

    await forgotPassword({ email: EMAIL });

    // Survives byte-for-byte, and — the part that actually matters — still works.
    expect((await storedUser()).verificationCode.code).toBe(signupCode);
    await expect(
      verifyCode({
        email: EMAIL,
        code: signupCode,
        reason: "account_verification",
      }),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it("does not disturb an email-change request that is still outstanding", async () => {
    // The third flow, from the other direction: an authenticated user with a
    // pending email change asks for a password reset. Both codes must remain
    // live, because the person is plausibly mid-way through both.
    const { forgotPassword } = await import("../../services/auth.service");
    const { requestEmailChange, confirmEmailChange } =
      await import("../../services/user.service");
    const session = await registerAndVerify();
    await requestEmailChange(session.userId, "moved@example.com");
    const changeCode = (await storedUser()).emailChangeCode.code!;

    await forgotPassword({ email: EMAIL });

    await expect(
      confirmEmailChange(session.userId, changeCode),
    ).resolves.toMatchObject({ user: { email: "moved@example.com" } });
  });

  // Regression: forgotPassword used to throw NotFoundError / 404 for an address
  // that is not registered while returning 200 "A password reset code has been
  // sent" for one that is. The generic success message showed the intent was
  // never to leak; the throw leaked anyway. Same enumeration oracle as
  // /auth/login, on an endpoint that needs no credentials at all.
  it("does not reveal whether an email is registered", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();

    const known = await forgotPassword({ email: EMAIL });
    const unknown = await forgotPassword({ email: "ghost@example.com" });

    expect(unknown).toEqual(known);
  });

  it("sends no mail for an address that is not registered", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    sendEmailMock.mockClear(); // drop the signup email from the setup above

    await forgotPassword({ email: "ghost@example.com" });

    // The generic response is a cover story, not a licence to mail strangers:
    // an attacker could otherwise use it to spam an arbitrary inbox.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  async function startReset(email = EMAIL) {
    const { forgotPassword } = await import("../../services/auth.service");
    await forgotPassword({ email });
    return (await storedUser(email)).passwordResetCode.code!;
  }

  it("replaces the password so the user can log in with the new one", async () => {
    const { resetPassword, login } =
      await import("../../services/auth.service");
    await registerAndVerify();
    const code = await startReset();

    await resetPassword({ email: EMAIL, code, newPassword: OTHER_PASSWORD });

    const user = await storedUser();
    await expect(compare(OTHER_PASSWORD, user.password)).resolves.toBe(true);
    await expect(compare(PASSWORD, user.password)).resolves.toBe(false);
    await expect(
      login({ email: EMAIL, password: OTHER_PASSWORD }),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
    await expect(login({ email: EMAIL, password: PASSWORD })).rejects.toThrow();
  });

  it("leaves the password untouched when the code is wrong", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    await startReset();

    await captureError(
      resetPassword({
        email: EMAIL,
        code: "000000",
        newPassword: OTHER_PASSWORD,
      }),
    );

    // The account-takeover case: guessing the OTP must not be optional.
    const user = await storedUser();
    await expect(compare(PASSWORD, user.password)).resolves.toBe(true);
    await expect(compare(OTHER_PASSWORD, user.password)).resolves.toBe(false);
  });

  it("leaves the password untouched when the code has expired", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    const code = await startReset();
    await expireStoredCode(EMAIL, "passwordResetCode");

    const err = await captureError(
      resetPassword({ email: EMAIL, code, newPassword: OTHER_PASSWORD }),
    );

    // An expired code is still a *correct* code, so this is the one check that
    // bounds how long an old reset email stays weaponisable.
    expect(err.message).toMatch(/expired/i);
    await expect(
      compare(PASSWORD, (await storedUser()).password),
    ).resolves.toBe(true);
  });

  it("does not reveal whether an email is registered", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    await registerAndVerify();

    // A registered address with no reset pending, and an address that is not
    // registered at all, are the same situation from the caller's side: there
    // is no reset code for it. Answering 404 for the second would hand back the
    // enumeration oracle that forgotPassword no longer gives out.
    const noResetPending = await captureError(
      resetPassword({ email: EMAIL, code: "000000", newPassword: PASSWORD }),
    );
    const notRegistered = await captureError(
      resetPassword({
        email: "ghost@example.com",
        code: "000000",
        newPassword: PASSWORD,
      }),
    );

    expect(notRegistered.constructor.name).toBe(
      noResetPending.constructor.name,
    );
    expect(notRegistered.statusCode).toBe(noResetPending.statusCode);
    expect(notRegistered.message).toBe(noResetPending.message);
  });

  it("refuses a signup verification code as a reset code", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    await register();
    const signupCode = (await storedUser()).verificationCode.code!;

    const err = await captureError(
      resetPassword({
        email: EMAIL,
        code: signupCode,
        newPassword: OTHER_PASSWORD,
      }),
    );

    // The security property is unchanged; only the mechanism moved. The two
    // flows used to share one `verificationCode` slot, so the `reason` guard
    // was the ONLY thing stopping a signup OTP from rewriting the password —
    // and the message said so. Reset now reads `passwordResetCode`, a slot
    // signup never writes, so the signup code is not merely rejected but
    // invisible: hence "no verification code" rather than "invalid reason".
    // Assert the outcome that matters — the password is untouched — and pin
    // the structural separation, so a regression that merges the slots again
    // fails here rather than quietly falling back to the reason check.
    expect(err.message).toMatch(/no verification code/i);
    await expect(
      compare(PASSWORD, (await storedUser()).password),
    ).resolves.toBe(true);
  });

  it("refuses a code sitting in the reset slot under another flow's reason", async () => {
    // Defence in depth, and the reason the `reason` guard was kept after the
    // slots were split (see models/User.ts). The slot separation is a
    // structural barrier; this is the one that still fires if some future
    // write puts a code in the wrong slot. Without it that write would be
    // silently authorised as a password reset.
    const { resetPassword } = await import("../../services/auth.service");
    const { Users } = await import("../../models/User");
    await registerAndVerify();
    await Users.updateOne(
      { email: EMAIL },
      {
        $set: {
          passwordResetCode: {
            code: "654321",
            expireAt: new Date(Date.now() + 10 * 60 * 1000),
            reason: "email_change",
          },
        },
      },
    );

    const err = await captureError(
      resetPassword({
        email: EMAIL,
        code: "654321",
        newPassword: OTHER_PASSWORD,
      }),
    );

    expect(err.message).toMatch(/reason/i);
    await expect(
      compare(PASSWORD, (await storedUser()).password),
    ).resolves.toBe(true);
  });

  it("consumes only its own slot, leaving a pending signup code alone", async () => {
    // The mirror of the forgotPassword isolation tests: consuming a reset must
    // not clear the other flows either. A shared slot made "reset your
    // password" also mean "your signup code is now dead".
    const { resetPassword, verifyCode } =
      await import("../../services/auth.service");
    await register();
    const signupCode = (await storedUser()).verificationCode.code!;
    const resetCode = await startReset();

    await resetPassword({
      email: EMAIL,
      code: resetCode,
      newPassword: OTHER_PASSWORD,
    });

    await expect(
      verifyCode({
        email: EMAIL,
        code: signupCode,
        reason: "account_verification",
      }),
    ).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it("consumes the code so the same reset cannot be replayed", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    const code = await startReset();
    await resetPassword({ email: EMAIL, code, newPassword: OTHER_PASSWORD });

    const err = await captureError(
      resetPassword({ email: EMAIL, code, newPassword: "ThirdPassword7!" }),
    );

    // Without consumption a leaked reset email would stay a permanent backdoor
    // into the account, long after the legitimate reset completed.
    expect(err.message).toMatch(/no verification code/i);
    await expect(
      compare(OTHER_PASSWORD, (await storedUser()).password),
    ).resolves.toBe(true);
  });

  it("revokes the stored refresh token so existing sessions cannot be refreshed", async () => {
    const { resetPassword, refreshToken: rotate } =
      await import("../../services/auth.service");
    const session = await registerAndVerify();
    const code = await startReset();

    await resetPassword({ email: EMAIL, code, newPassword: OTHER_PASSWORD });

    // "I think someone is in my account" has to actually evict them. Clearing
    // the stored token is what does it — note the already-issued *access*
    // token stays valid for its remaining lifetime (ACCESS_TOKEN_TTL_SECONDS,
    // 1h), since `protect` verifies signatures without consulting the DB.
    expect((await storedUser()).refreshToken).toBe("");
    await expect(rotate(session.refreshToken)).rejects.toThrow();
  });

  it("rejects a reset for an address that has no account", async () => {
    const { resetPassword } = await import("../../services/auth.service");
    const { Errors } = await import("../../errors");

    const err = await captureError(
      resetPassword({
        email: "ghost@example.com",
        code: "000000",
        newPassword: OTHER_PASSWORD,
      }),
    );

    // Still rejected, but as BadRequest/NO_VERIFICATION_CODE_FOUND rather than
    // NotFound: the reason it is refused must not double as confirmation that
    // the address is unregistered. See the enumeration test above.
    expect(err).toBeInstanceOf(Errors.BadRequestError);
  });
});

describe("generateTokens", () => {
  it("signs an access token carrying userId, email, role and shopId for one hour", async () => {
    const { login } = await import("../../services/auth.service");
    const { ACCESS_TOKEN_TTL_SECONDS } = await import("../../config/cookies");
    const { Users } = await import("../../models/User");
    const { Shops } = await import("../../models/Shop");
    await registerAndVerify();
    const user = await storedUser();
    const shop = await Shops.create({
      name: "Test Bistro",
      type: "restaurant",
      address: { country: "EG", city: "Cairo", street: "1 Main St" },
      phoneNumber: "01000000000",
      email: EMAIL,
      ownerId: user._id,
    });
    await Users.updateOne({ _id: user._id }, { $set: { shop: shop._id } });

    const { accessToken } = await login({ email: EMAIL, password: PASSWORD });

    // These four claims are the whole authorisation input for every protected
    // route: middlewares/auth.ts trusts them without re-reading the database,
    // so a missing or wrong claim is either a lockout or a privilege bug.
    const claims = decode(accessToken);
    expect(claims.userId).toBe(user._id.toString());
    expect(claims.email).toBe(EMAIL);
    expect(claims.role).toBe("user");
    expect(claims.shopId).toBe(shop._id.toString());
    expect(claims.exp! - claims.iat!).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it("keeps role and shop out of the refresh token and gives it seven days", async () => {
    const { login } = await import("../../services/auth.service");
    const { REFRESH_TOKEN_TTL_SECONDS } = await import("../../config/cookies");
    await registerAndVerify();

    const { refreshToken } = await login({ email: EMAIL, password: PASSWORD });

    // The refresh token is long-lived, so it deliberately carries no authority
    // of its own — role and shop are re-read from the database on every
    // rotation, which is what lets a demotion take effect within the hour.
    const claims = decode(refreshToken);
    expect(claims.role).toBeUndefined();
    expect(claims.shopId).toBeUndefined();
    expect(claims.exp! - claims.iat!).toBe(REFRESH_TOKEN_TTL_SECONDS);
  });

  it("produces tokens that do not verify under a different secret", async () => {
    const { generateTokens } = await import("../../services/auth.service");

    const { accessToken, refreshToken } = await generateTokens({
      _id: new mongoose.Types.ObjectId(),
      email: "signed@example.com",
    } as unknown as IUser);

    // Guards against the token ever being issued unsigned or with a constant:
    // `protect` would then accept a payload any caller could forge.
    for (const token of [accessToken, refreshToken]) {
      expect(() => jwt.verify(token, "some-other-secret")).toThrow();
      expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
    }
  });
});

describe("refreshToken", () => {
  it("rotates the token and rejects the previous one afterwards", async () => {
    const { refreshToken: rotate } =
      await import("../../services/auth.service");
    const session = await registerAndVerify();

    // A JWT's iat/exp have one-second granularity, so two tokens signed for the
    // same user inside the same second are byte-identical and "rotation" would
    // be untestable (and, briefly, a no-op). Wait past the boundary so the old
    // token is genuinely a different string being genuinely rejected.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const rotated = await rotate(session.refreshToken);

    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect((await storedUser()).refreshToken).toBe(rotated.refreshToken);
    // Single-use is the entire point: a stolen refresh token must die the
    // moment the legitimate client redeems it.
    await expect(rotate(session.refreshToken)).rejects.toThrow();
    await expect(rotate(rotated.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
  });

  it("rejects a validly signed token that is not the one stored for the user", async () => {
    const { refreshToken: rotate } =
      await import("../../services/auth.service");
    const { Errors } = await import("../../errors");
    const session = await registerAndVerify();

    // Correct signature, correct user, unexpired — only the database
    // comparison can catch this. Without it, every token ever issued to the
    // user would stay valid for seven days no matter how many times they
    // signed out or reset their password.
    //
    // The lifetime is 6 days rather than the service's 7 purely so the token
    // differs byte-for-byte: JWT iat/exp are whole seconds, so re-signing the
    // same payload with the same TTL inside the same second reproduces the
    // stored token exactly.
    const forged = jwt.sign(
      { userId: session.userId, email: EMAIL },
      JWT_SECRET,
      { expiresIn: 6 * 24 * 60 * 60 },
    );
    expect(forged).not.toBe(session.refreshToken);

    const err = await captureError(rotate(forged));
    expect(err).toBeInstanceOf(Errors.UnauthenticatedError);
  });

  it("rejects an expired refresh token", async () => {
    const { refreshToken: rotate } =
      await import("../../services/auth.service");
    const { Users } = await import("../../models/User");
    const session = await registerAndVerify();

    const expired = jwt.sign(
      { userId: session.userId, email: EMAIL },
      JWT_SECRET,
      { expiresIn: -10 },
    );
    // Stored as the current token, so only the expiry check can reject it.
    await Users.updateOne(
      { email: EMAIL },
      { $set: { refreshToken: expired } },
    );

    await expect(rotate(expired)).rejects.toThrow();
  });

  it("rejects a token whose user no longer exists", async () => {
    const { refreshToken: rotate } =
      await import("../../services/auth.service");
    const { Users } = await import("../../models/User");
    const session = await registerAndVerify();
    await Users.deleteMany({});

    // A deleted account must not keep refreshing its way to a live session.
    await expect(rotate(session.refreshToken)).rejects.toThrow();
  });

  it("rejects when no token is presented", async () => {
    const { refreshToken: rotate } =
      await import("../../services/auth.service");
    const { Errors } = await import("../../errors");

    const err = await captureError(rotate(undefined));

    expect(err).toBeInstanceOf(Errors.UnauthenticatedError);
  });
});

describe("signOut", () => {
  it("clears the stored refresh token so it can no longer be redeemed", async () => {
    const { signOut, refreshToken: rotate } =
      await import("../../services/auth.service");
    const session = await registerAndVerify();

    await signOut(session.userId);

    // "Sign out from all devices" is only real if the server-side copy goes;
    // clearing the cookie alone would leave the token redeemable from anywhere
    // it had already been captured.
    expect((await storedUser()).refreshToken).toBe("");
    await expect(rotate(session.refreshToken)).rejects.toThrow();
  });

  it("reports a missing user rather than silently succeeding", async () => {
    const { signOut } = await import("../../services/auth.service");
    const { Errors } = await import("../../errors");

    const err = await captureError(
      signOut(new mongoose.Types.ObjectId().toString()),
    );

    expect(err).toBeInstanceOf(Errors.NotFoundError);
  });
});
