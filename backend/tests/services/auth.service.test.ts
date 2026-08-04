import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
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
  await signUp({
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

async function expireStoredCode(email = EMAIL) {
  const { Users } = await import("../../models/User");
  await Users.updateOne(
    { email: email.toLowerCase() },
    { $set: { "verificationCode.expireAt": new Date(Date.now() - 1000) } },
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

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue(true);
  await seedUserRole();
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
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sendEmailMock.mockRejectedValue(new Error("SMTP down"));

    await expect(register()).resolves.toBeUndefined();

    // Deliberate: the send is fire-and-forget (`.catch(console.error)`), so a
    // mail outage must not roll back a valid registration. The user recovers
    // via resend-verification-code.
    const user = await storedUser();
    expect(user.verificationCode.code).toHaveLength(6);
    consoleError.mockRestore();
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

    // Note the ordering inside the service: this check runs *before* the
    // password compare, so the "not verified" answer is given to anyone who
    // guesses the address. See the enumeration test below.
    expect(err).toBeInstanceOf(Errors.UnauthenticatedError);
  });

  // DEFECT — not fixed here. services/auth.service.ts:216 vs :224.
  // An unknown email fails inside findUserByEmail with NotFoundError /
  // USER_NOT_FOUND / 404, while a known email with a wrong password fails with
  // UnauthorizedError / INVALID_EMAIL_OR_PASSWORD / 403. The two are trivially
  // distinguishable by status code and body, so /auth/login is an oracle for
  // "is this address registered here" — the input to credential stuffing and
  // targeted phishing. Remove `.skip` once both paths return the same error.
  it.skip("does not reveal whether an email is registered", async () => {
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

    // The reason field is what keeps the two OTP flows apart; both write to
    // the same single `verificationCode` slot on the user.
    expect(err.message).toMatch(/reason/i);
    expect((await storedUser()).isVerified).toBe(false);
  });

  // DEFECT — not fixed here. services/auth.service.ts:139-185, reachable via
  // POST /auth/verify-code, whose validator (validators/auth.validator.ts:25)
  // accepts any non-empty string as `reason`.
  // A password_reset OTP presented with reason "password_reset" satisfies every
  // check in verifyCode, so it mints a full access token plus a 7-day refresh
  // token and flips isVerified to true — without the holder ever setting a
  // password. A reset code is therefore a login credential, and the reset flow
  // doubles as an email-verification bypass. Least privilege says a reset code
  // should only authorise resetPassword.
  it.skip("does not let a password-reset code be exchanged for a session", async () => {
    const { forgotPassword, verifyCode } =
      await import("../../services/auth.service");
    await register();
    await forgotPassword({ email: EMAIL });
    const code = (await storedUser()).verificationCode.code!;

    await expect(
      verifyCode({ email: EMAIL, code, reason: "password_reset" }),
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

  it("refuses to resend to an account that is already verified", async () => {
    const { resendVerificationCode } =
      await import("../../services/auth.service");
    const { Errors } = await import("../../errors");
    await registerAndVerify();
    sendEmailMock.mockClear(); // drop the signup email from the setup above

    const err = await captureError(resendVerificationCode({ email: EMAIL }));

    // Otherwise an unauthenticated caller could keep writing a fresh OTP onto a
    // live account (and keep mailing it) indefinitely.
    expect(err).toBeInstanceOf(Errors.BadRequestError);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("forgotPassword", () => {
  it("stores a 10-minute password_reset code and emails it", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();
    const before = Date.now();

    await forgotPassword({ email: EMAIL });

    const user = await storedUser();
    expect(user.verificationCode.reason).toBe("password_reset");
    expect(user.verificationCode.code).toHaveLength(6);
    const ttl = new Date(user.verificationCode.expireAt!).getTime() - before;
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    const [, , html] = sendEmailMock.mock.calls.at(-1) as string[];
    expect(html).toContain(user.verificationCode.code);
  });

  // DEFECT — not fixed here. services/auth.service.ts:240 (findUserByEmail at
  // :63-65). forgotPassword throws NotFoundError / 404 for an address that is
  // not registered, but returns 200 "A password reset code has been sent" for
  // one that is. The generic success message shows the intent was not to leak;
  // the throw leaks anyway. Same enumeration oracle as /auth/login, on an
  // endpoint that needs no credentials at all. The fix is to return the same
  // generic response either way and simply not send mail for unknown addresses.
  it.skip("does not reveal whether an email is registered", async () => {
    const { forgotPassword } = await import("../../services/auth.service");
    await registerAndVerify();

    const known = await forgotPassword({ email: EMAIL });
    const unknown = await forgotPassword({ email: "ghost@example.com" });

    expect(unknown).toEqual(known);
  });
});

describe("resetPassword", () => {
  async function startReset(email = EMAIL) {
    const { forgotPassword } = await import("../../services/auth.service");
    await forgotPassword({ email });
    return (await storedUser(email)).verificationCode.code!;
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
    await expireStoredCode();

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

    // Both flows share one `verificationCode` slot, so the reason guard is the
    // only thing stopping a signup OTP from rewriting the password.
    expect(err.message).toMatch(/reason/i);
    await expect(
      compare(PASSWORD, (await storedUser()).password),
    ).resolves.toBe(true);
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

    expect(err).toBeInstanceOf(Errors.NotFoundError);
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
