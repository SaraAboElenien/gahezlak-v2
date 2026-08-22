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
import type { Types } from "mongoose";
import bcrypt from "bcryptjs";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Users } from "../../models/User";
import { Roles, Role } from "../../models/Role";
import { Shops } from "../../models/Shop";
// Side-effect import: getUserProfile populates shop → subscriptionId → plan,
// and mongoose resolves a ref by model *name* at populate time. Without the
// Subscription model having been registered on the connection the whole
// profile query dies with MissingSchemaError — in production it is registered
// as a side effect of the route graph, here nothing else imports it.
import "../../models/Subscription";
import { errMsg } from "../../common/err-messages";

/**
 * Service-level coverage for the user service, which had none.
 *
 * Three of its five areas are security-relevant in their own right, and they
 * fail in different directions:
 *
 * - The email-change pair is an **account-takeover surface**. It moves the
 *   identifier every other flow keys off — login, password reset, and the
 *   `email` claim on the access token — so the code has to be delivered to the
 *   *destination* address (proving the requester controls it) and the
 *   destination has to still be free when the change lands, not merely when it
 *   was requested.
 * - `changePassword` is the remediation people are told to perform when they
 *   think they have been compromised, so what it revokes matters as much as
 *   what it sets.
 * - `getUserProfile` / `getAllUsers` / `getUserByIdAdmin` are pure disclosure
 *   controls: each relies on a `.select()` projection to keep password hashes,
 *   refresh tokens and live OTP codes out of a response. Nothing would break
 *   if one of those projections were deleted, which is exactly why they need a
 *   test.
 *
 * Deliberately NOT mocked: Mongo and bcrypt. Both matter here — the
 * duplicate-email regression below is a property of the unique index rather
 * than of this file's control flow, and a mocked model cannot tell you about
 * it. Only the SMTP boundary is stubbed.
 */

// Left un-stubbed, `sendEmail` opens a real SMTP connection to whatever relay
// the environment happens to name and posts a verification code to a real
// address. Stubbing it is also what makes "no mail is sent when the address is
// already taken" an assertion worth writing rather than a description of a mock.
const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/send-email", () => ({
  sendEmail: sendEmailMock,
}));

const userService = () => import("../../services/user.service");

// users.email and shops.name carry unique indexes, and the indexes outlive
// clearTestDB(); counters keep every seeded fixture distinct.
let emailSeq = 0;
const nextEmail = () => `user${++emailSeq}@example.com`;
let shopNameSeq = 0;
const nextShopName = () => `Test Bistro ${++shopNameSeq}`;

type CapturedError = Error & { statusCode?: number; code?: number };

/**
 * Awaits a call that is expected to reject and hands back the error itself, so
 * a test can inspect it. Fails loudly if the call resolves.
 */
async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
  try {
    await promise;
  } catch (err) {
    return err as CapturedError;
  }
  throw new Error("expected the call to reject, but it resolved");
}

let userRoleId: Types.ObjectId;

const PLAIN_PASSWORD = "OldPass123!";

async function seedUser(
  overrides: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    isVerified?: boolean;
    refreshToken?: string;
    newEmail?: string | null;
    role?: Types.ObjectId;
    shop?: Types.ObjectId;
    verificationCode?: {
      code: string | null;
      expireAt: Date | null;
      reason: string | null;
    };
    createdAt?: Date;
  } = {},
) {
  const { createdAt, password, ...rest } = overrides;
  const user = await Users.create({
    firstName: "Test",
    lastName: "User",
    email: nextEmail(),
    // Hashed for real: changePassword compares against this with bcrypt, so a
    // plaintext fixture would make every "wrong old password" test pass for
    // the wrong reason.
    password: await bcrypt.hash(password ?? PLAIN_PASSWORD, 10),
    phoneNumber: "01000000000",
    isVerified: true,
    role: userRoleId,
    ...rest,
  });

  if (createdAt) {
    // timestamps:false so the plugin doesn't stomp the value straight back.
    await Users.findByIdAndUpdate(
      user._id,
      { createdAt },
      { timestamps: false },
    );
  }

  return user;
}

/**
 * Reads a user back including the `select: false` password field.
 *
 * The id is taken as `unknown` and stringified because IUser declares `_id`
 * with mongoose's schema-level `ObjectId` type rather than the runtime
 * `Types.ObjectId` class, and the two don't line up structurally even though
 * they are the same value — the same wrinkle shop.service.ts:299 works around.
 */
async function readUser(id: unknown) {
  const user = await Users.findById(String(id)).select("+password").lean();
  if (!user) throw new Error("fixture user disappeared");
  return user;
}

const TEN_MINUTES = 10 * 60 * 1000;

beforeAll(async () => {
  await connectTestDB();
  // Build the unique index up front. Mongoose builds indexes in the
  // background, so without this the duplicate-email tests can race the build
  // and pass for the wrong reason (or fail intermittently).
  await Users.init();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  sendEmailMock.mockResolvedValue(true);
  const role = await Roles.create({ name: Role.USER, permissions: [] });
  userRoleId = role._id;
});

describe("requestEmailChange", () => {
  it("stores a pending change and sends the code to the NEW address", async () => {
    const { requestEmailChange } = await userService();
    const user = await seedUser({ email: "current@example.com" });

    const result = await requestEmailChange(
      user._id.toString(),
      "new@example.com",
    );

    const stored = await readUser(user._id);
    expect(stored.newEmail).toBe("new@example.com");
    // Still the old address until the code is confirmed — a pending request
    // must not move the identifier anyone logs in with.
    expect(stored.email).toBe("current@example.com");
    expect(stored.verificationCode.code).toMatch(/^[a-zA-Z0-9]{6}$/);
    expect(stored.verificationCode.reason).toBe("email_change");
    expect(result.message).toContain("confirmation code");

    // The delivery address is the whole security property of this endpoint.
    // Mailing the code to the *current* address would let anyone holding a
    // hijacked session move the account to an address they don't control;
    // mailing it to the new one is what proves they do.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [to, , html] = sendEmailMock.mock.calls[0];
    expect(to).toBe("new@example.com");
    expect(html).toContain(stored.verificationCode.code);
  });

  it("expires the code in 10 minutes", async () => {
    const { requestEmailChange } = await userService();
    const user = await seedUser();

    const before = Date.now();
    await requestEmailChange(user._id.toString(), "new@example.com");
    const after = Date.now();

    const stored = await readUser(user._id);
    const expireAt = new Date(stored.verificationCode.expireAt!).getTime();
    expect(expireAt).toBeGreaterThanOrEqual(before + TEN_MINUTES);
    expect(expireAt).toBeLessThanOrEqual(after + TEN_MINUTES);
  });

  it("normalises the requested address to lower case", async () => {
    // Everything else in the app stores and looks up lower-cased addresses
    // (auth.service.ts normalises on signup, login and reset). If the pending
    // address kept its casing, confirming would write a variant that no login
    // lookup would ever match, and the unique index would not see it as a
    // duplicate of the same mailbox either.
    const { requestEmailChange } = await userService();
    const user = await seedUser();

    await requestEmailChange(user._id.toString(), "MiXeD@Example.COM");

    const stored = await readUser(user._id);
    expect(stored.newEmail).toBe("mixed@example.com");
  });

  it("refuses an address that already belongs to another account, and writes nothing", async () => {
    const { requestEmailChange } = await userService();
    await seedUser({ email: "taken@example.com" });
    const user = await seedUser();

    const err = await captureError(
      requestEmailChange(user._id.toString(), "taken@example.com"),
    );

    expect(err.message).toBe(errMsg.EMAIL_ALREADY_IN_USE.en);
    expect(err.statusCode).toBe(400);
    // No half-applied request left behind, and no mail to an address the
    // caller has just been told they may not have.
    const stored = await readUser(user._id);
    expect(stored.newEmail).toBeFalsy();
    expect(stored.verificationCode.code).toBeNull();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown user", async () => {
    const { requestEmailChange } = await userService();

    const err = await captureError(
      requestEmailChange(
        new mongoose.Types.ObjectId().toString(),
        "new@example.com",
      ),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("surfaces a mail-delivery failure as a 400", async () => {
    const { requestEmailChange } = await userService();
    const user = await seedUser();
    sendEmailMock.mockResolvedValue(false);

    const err = await captureError(
      requestEmailChange(user._id.toString(), "new@example.com"),
    );

    expect(err.message).toBe(errMsg.FAILED_TO_SEND_EMAIL.en);
    expect(err.statusCode).toBe(400);
    // Documented current behaviour, not an endorsement: the pending change is
    // saved *before* the mail is attempted, so a delivery failure leaves a
    // code the user was never shown. Harmless — it expires, the address has
    // not moved, and re-requesting overwrites it — but it is why the caller
    // must not read a 400 here as "nothing happened".
    const stored = await readUser(user._id);
    expect(stored.newEmail).toBe("new@example.com");
  });
});

describe("confirmEmailChange", () => {
  async function seedPendingChange(
    overrides: {
      code?: string;
      reason?: string;
      expireAt?: Date;
      newEmail?: string;
      email?: string;
    } = {},
  ) {
    return seedUser({
      email: overrides.email ?? "current@example.com",
      newEmail: overrides.newEmail ?? "new@example.com",
      verificationCode: {
        code: overrides.code ?? "123456",
        expireAt: overrides.expireAt ?? new Date(Date.now() + TEN_MINUTES),
        reason: overrides.reason ?? "email_change",
      },
    });
  }

  it("moves the address and clears the pending request", async () => {
    const { confirmEmailChange } = await userService();
    const user = await seedPendingChange();

    const result = await confirmEmailChange(user._id.toString(), "123456");

    expect(result.user.email).toBe("new@example.com");
    const stored = await readUser(user._id);
    expect(stored.email).toBe("new@example.com");
    expect(stored.newEmail).toBeFalsy();
    expect(stored.verificationCode.code).toBeNull();
    expect(stored.verificationCode.reason).toBeNull();
    expect(stored.verificationCode.expireAt).toBeNull();
  });

  it("cannot be replayed once the change has landed", async () => {
    // The clearing above is the only thing stopping a leaked code from being
    // reused, so assert the consequence rather than just the field values.
    const { confirmEmailChange } = await userService();
    const user = await seedPendingChange();
    await confirmEmailChange(user._id.toString(), "123456");

    const err = await captureError(
      confirmEmailChange(user._id.toString(), "123456"),
    );

    expect(err.message).toBe(errMsg.NO_EMAIL_CHANGE_REQUEST_FOUND.en);
  });

  it("rejects a wrong code and leaves the address alone", async () => {
    const { confirmEmailChange } = await userService();
    const user = await seedPendingChange({ code: "123456" });

    const err = await captureError(
      confirmEmailChange(user._id.toString(), "999999"),
    );

    expect(err.message).toBe(errMsg.INVALID_CONFIRMATION_CODE.en);
    expect(err.statusCode).toBe(400);
    const stored = await readUser(user._id);
    expect(stored.email).toBe("current@example.com");
    // The pending request survives a wrong guess, so the real owner can still
    // finish; there is deliberately no attempt counter here (see report).
    expect(stored.newEmail).toBe("new@example.com");
  });

  it("rejects an expired code and leaves the address alone", async () => {
    const { confirmEmailChange } = await userService();
    const user = await seedPendingChange({
      expireAt: new Date(Date.now() - 1000),
    });

    const err = await captureError(
      confirmEmailChange(user._id.toString(), "123456"),
    );

    expect(err.message).toBe(errMsg.CONFIRMATION_CODE_EXPIRED.en);
    const stored = await readUser(user._id);
    expect(stored.email).toBe("current@example.com");
  });

  it("refuses a code minted for a different flow", async () => {
    // All three OTP flows (account verification, password reset, email change)
    // write to the same `verificationCode` sub-document, so `reason` is the
    // only thing keeping them apart. Without this check a password-reset code
    // — which the user can mint for themselves, unauthenticated, at any time —
    // would also confirm an email change.
    const { confirmEmailChange } = await userService();
    const user = await seedPendingChange({ reason: "password_reset" });

    const err = await captureError(
      confirmEmailChange(user._id.toString(), "123456"),
    );

    expect(err.message).toBe(errMsg.INVALID_CONFIRMATION_REASON.en);
    const stored = await readUser(user._id);
    expect(stored.email).toBe("current@example.com");
  });

  it("rejects a confirmation with no pending request", async () => {
    const { confirmEmailChange } = await userService();
    const user = await seedUser();

    const err = await captureError(
      confirmEmailChange(user._id.toString(), "123456"),
    );

    expect(err.message).toBe(errMsg.NO_EMAIL_CHANGE_REQUEST_FOUND.en);
  });

  it("rejects an unknown user", async () => {
    const { confirmEmailChange } = await userService();

    const err = await captureError(
      confirmEmailChange(new mongoose.Types.ObjectId().toString(), "123456"),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });

  it("regression: refuses an address someone else claimed after the request was made", async () => {
    // Uniqueness was checked when the change was *requested*, and the request
    // stays valid for ten minutes. Anyone can sign up in that window — so by
    // the time the code is confirmed the destination may no longer be free.
    //
    // Before the fix the recheck did not exist, and `user.save()` walked
    // straight into the unique index on `users.email`. The driver wraps that
    // as "Plan executor error during update :: caused by :: E11000 duplicate
    // key error collection: test.users index: email_1 …" — a raw internal
    // string, and not the `{ name: "MongoServerError", code: 11000 }` shape
    // the global handler sniffs for, so it lands in the 500 catch-all and
    // gets reported to Sentry as an unanticipated failure. The point of this
    // test is that the collision is caught by the service, as a 400 naming
    // the email, before it ever reaches the driver.
    const { requestEmailChange, confirmEmailChange } = await userService();
    const user = await seedUser({ email: "current@example.com" });
    await requestEmailChange(user._id.toString(), "contested@example.com");
    const code = (await readUser(user._id)).verificationCode.code!;

    // The race: a second account takes the address while the code is in flight.
    await seedUser({ email: "contested@example.com" });

    const err = await captureError(
      confirmEmailChange(user._id.toString(), code),
    );

    expect(err.message).toBe(errMsg.EMAIL_ALREADY_IN_USE.en);
    expect(err.statusCode).toBe(400);
    expect(err.code).not.toBe(11000);
    const stored = await readUser(user._id);
    expect(stored.email).toBe("current@example.com");
  });

  it("does not mistake the user's own pending address for a collision", async () => {
    // The recheck above must exclude the requesting user, or a change to an
    // address only *they* hold pending would be refused. Guards the other
    // direction of the same fix.
    const { requestEmailChange, confirmEmailChange } = await userService();
    const user = await seedUser({ email: "current@example.com" });
    await requestEmailChange(user._id.toString(), "free@example.com");
    const code = (await readUser(user._id)).verificationCode.code!;

    const result = await confirmEmailChange(user._id.toString(), code);

    expect(result.user.email).toBe("free@example.com");
  });
});

describe("getUserById", () => {
  it("returns the user document", async () => {
    const { getUserById } = await userService();
    const user = await seedUser({ firstName: "Ada" });

    const found = await getUserById(user._id.toString());

    expect(found.firstName).toBe("Ada");
  });

  it("rejects an unknown user", async () => {
    const { getUserById } = await userService();

    const err = await captureError(
      getUserById(new mongoose.Types.ObjectId().toString()),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});

describe("getUserProfile", () => {
  it("withholds the password, refresh token, OTP and pending address", async () => {
    // This is the response the logged-in dashboard renders, so everything in
    // it reaches the browser. A live `verificationCode` in particular would
    // hand any XSS on the dashboard a working email-change confirmation.
    const { getUserProfile } = await userService();
    const user = await seedUser({
      refreshToken: "a-real-looking-refresh-token",
      newEmail: "pending@example.com",
      verificationCode: {
        code: "654321",
        expireAt: new Date(Date.now() + TEN_MINUTES),
        reason: "email_change",
      },
    });

    const profile = (await getUserProfile(user._id.toString())).toObject();

    expect(profile.email).toBeDefined();
    expect(profile.password).toBeUndefined();
    expect(profile.refreshToken).toBeUndefined();
    expect(profile.verificationCode).toBeUndefined();
    expect(profile.newEmail).toBeUndefined();
  });

  it("populates the role name and the shop", async () => {
    const { getUserProfile } = await userService();
    const owner = new mongoose.Types.ObjectId();
    const shop = await Shops.create({
      name: nextShopName(),
      type: "restaurant",
      address: { country: "EG", city: "Cairo", street: "1 Main St" },
      phoneNumber: "01000000000",
      email: "shop@example.com",
      ownerId: owner,
    });
    const user = await seedUser({ shop: shop._id });

    const profile = await getUserProfile(user._id.toString());

    expect((profile.role as { name?: string }).name).toBe(Role.USER);
    expect((profile.shop as { name?: string }).name).toBe(shop.name);
    // The projection on the populated shop is a disclosure control too: the
    // member roster (user ids and role ids of every employee) is not part of
    // it.
    expect((profile.shop as { members?: unknown }).members).toBeUndefined();
  });

  it("rejects an unknown user", async () => {
    const { getUserProfile } = await userService();

    const err = await captureError(
      getUserProfile(new mongoose.Types.ObjectId().toString()),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});

describe("updateUserProfile", () => {
  it("saves every field the profile form submits", async () => {
    // Both directions of the allowlist matter, and this is the direction that
    // gets forgotten: an earlier allowlist elsewhere in this codebase silently
    // stripped two legitimate fields from every update while still returning
    // 200, and shipped, because the test only asserted the fields that
    // happened to survive. `validateUpdateProfile` names exactly these three.
    const { updateUserProfile } = await userService();
    const user = await seedUser();

    const result = await updateUserProfile(user._id.toString(), {
      firstName: "Grace",
      lastName: "Hopper",
      phoneNumber: "01099998888",
    });

    expect(result.user.firstName).toBe("Grace");
    expect(result.user.lastName).toBe("Hopper");
    expect(result.user.phoneNumber).toBe("01099998888");
    const stored = await readUser(user._id);
    expect(stored.firstName).toBe("Grace");
    expect(stored.lastName).toBe("Hopper");
    expect(stored.phoneNumber).toBe("01099998888");
  });

  it("leaves omitted fields untouched", async () => {
    const { updateUserProfile } = await userService();
    const user = await seedUser({ firstName: "Ada", lastName: "Lovelace" });

    await updateUserProfile(user._id.toString(), { firstName: "Grace" });

    const stored = await readUser(user._id);
    expect(stored.firstName).toBe("Grace");
    expect(stored.lastName).toBe("Lovelace");
  });

  it("ignores privilege and identity fields smuggled into the payload", async () => {
    // `updateUserProfileHandler` hands `req.body` straight through, and
    // express-validator checks the fields it names without stripping the ones
    // it doesn't — so whatever the body contains arrives here intact. The
    // service assigns three named fields rather than spreading, which is what
    // stops this being a self-service promotion to admin; assert the property
    // rather than trusting the shape to stay that way.
    const { updateUserProfile } = await userService();
    const adminRole = await Roles.create({ name: Role.ADMIN, permissions: [] });
    const otherShop = new mongoose.Types.ObjectId();
    const user = await seedUser({ email: "victim@example.com" });
    const originalHash = (await readUser(user._id)).password;

    await updateUserProfile(user._id.toString(), {
      firstName: "Grace",
      role: adminRole._id,
      shop: otherShop,
      email: "attacker@example.com",
      isVerified: true,
      password: "not-a-hash",
      refreshToken: "forged",
    } as unknown as Parameters<typeof updateUserProfile>[1]);

    const stored = await readUser(user._id);
    expect(stored.firstName).toBe("Grace");
    expect(String(stored.role)).toBe(String(userRoleId));
    expect(stored.shop).toBeUndefined();
    expect(stored.email).toBe("victim@example.com");
    expect(stored.password).toBe(originalHash);
    expect(stored.refreshToken).toBe("");
  });

  it("rejects an unknown user", async () => {
    const { updateUserProfile } = await userService();

    const err = await captureError(
      updateUserProfile(new mongoose.Types.ObjectId().toString(), {
        firstName: "Grace",
      }),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});

describe("getAllUsers", () => {
  it("paginates, reports the totals, and returns newest first", async () => {
    const { getAllUsers } = await userService();
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      await seedUser({
        firstName: `User${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }

    const page1 = await getAllUsers(1, 2);
    const page2 = await getAllUsers(2, 2);

    expect(page1.users).toHaveLength(2);
    expect(page1.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 5,
      pages: 3,
    });
    expect(page1.users[0].firstName).toBe("User4");
    expect(page2.users[0].firstName).toBe("User2");
  });

  it("searches name, email and phone, case-insensitively", async () => {
    const { getAllUsers } = await userService();
    await seedUser({ firstName: "Ada", lastName: "Lovelace" });
    await seedUser({ email: "grace@navy.example.com" });
    await seedUser({ phoneNumber: "01555512345" });
    await seedUser({ firstName: "Nobody" });

    expect((await getAllUsers(1, 10, "lovel")).users).toHaveLength(1);
    expect((await getAllUsers(1, 10, "ADA")).users).toHaveLength(1);
    expect((await getAllUsers(1, 10, "navy")).users).toHaveLength(1);
    expect((await getAllUsers(1, 10, "555512")).users).toHaveLength(1);
    expect((await getAllUsers(1, 10, "no-such-thing")).users).toHaveLength(0);
  });

  it("returns everyone when no search term is given", async () => {
    const { getAllUsers } = await userService();
    await seedUser();
    await seedUser();

    // An empty string is falsy, so no `$or` is built at all — the admin list
    // with a cleared search box must still be the full list.
    const result = await getAllUsers(1, 10, "");

    expect(result.users).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it("regression: treats regex metacharacters in the search term as literals", async () => {
    // The search term is interpolated into a `$regex`. Unescaped, `.*` is a
    // match-everything wildcard rather than a search for two literal
    // characters, and a nested-quantifier term is a ReDoS against the query
    // planner. `escapeRegex` (utils/escape-regex.ts) is what makes the term
    // data instead of code, and nothing about the endpoint's behaviour would
    // look wrong if it were removed — hence this test.
    const { getAllUsers } = await userService();
    await seedUser({ firstName: "axb" });
    await seedUser({ firstName: "Zoe" });

    expect((await getAllUsers(1, 10, ".*")).users).toHaveLength(0);
    expect((await getAllUsers(1, 10, "a.b")).users).toHaveLength(0);
    // Control case, so the two assertions above cannot pass merely because
    // the search is broken and matches nothing at all.
    expect((await getAllUsers(1, 10, "axb")).users).toHaveLength(1);
  });

  it("withholds passwords, refresh tokens and OTP codes from the admin list", async () => {
    const { getAllUsers } = await userService();
    await seedUser({
      refreshToken: "a-real-looking-refresh-token",
      verificationCode: {
        code: "654321",
        expireAt: new Date(Date.now() + TEN_MINUTES),
        reason: "password_reset",
      },
    });

    const { users } = await getAllUsers(1, 10);

    const row = users[0].toObject();
    expect(row.password).toBeUndefined();
    expect(row.refreshToken).toBeUndefined();
    expect(row.verificationCode).toBeUndefined();
  });
});

describe("getUserByIdAdmin", () => {
  it("withholds the password, refresh token and OTP code", async () => {
    const { getUserByIdAdmin } = await userService();
    const user = await seedUser({
      refreshToken: "a-real-looking-refresh-token",
      verificationCode: {
        code: "654321",
        expireAt: new Date(Date.now() + TEN_MINUTES),
        reason: "password_reset",
      },
    });

    const found = (await getUserByIdAdmin(user._id.toString())).toObject();

    expect(found.email).toBeDefined();
    expect(found.password).toBeUndefined();
    expect(found.refreshToken).toBeUndefined();
    expect(found.verificationCode).toBeUndefined();
  });

  it("rejects an unknown user", async () => {
    const { getUserByIdAdmin } = await userService();

    const err = await captureError(
      getUserByIdAdmin(new mongoose.Types.ObjectId().toString()),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});

describe("changePassword", () => {
  it("stores a real bcrypt hash of the new password and retires the old one", async () => {
    const { changePassword } = await userService();
    const user = await seedUser();

    await changePassword(user._id.toString(), PLAIN_PASSWORD, "NewPass456!");

    const stored = await readUser(user._id);
    expect(stored.password).not.toBe("NewPass456!");
    await expect(bcrypt.compare("NewPass456!", stored.password)).resolves.toBe(
      true,
    );
    await expect(bcrypt.compare(PLAIN_PASSWORD, stored.password)).resolves.toBe(
      false,
    );
  });

  it("regression: revokes the stored refresh token", async () => {
    // `refreshToken` on the user document is the server side of the httpOnly
    // refresh cookie: auth.service.refreshToken() mints a new access token for
    // anyone presenting a cookie that still equals this field. Leaving it in
    // place meant a password change — the action a person takes precisely
    // *because* they believe someone else has their session — revoked nothing:
    // the attacker's cookie kept minting hour-long access tokens indefinitely.
    // Clearing it is what makes the old session unusable at its next refresh.
    const { changePassword } = await userService();
    const user = await seedUser({ refreshToken: "attackers-live-session" });

    await changePassword(user._id.toString(), PLAIN_PASSWORD, "NewPass456!");

    const stored = await readUser(user._id);
    expect(stored.refreshToken).toBe("");
  });

  it("rejects a wrong old password without touching the stored hash", async () => {
    const { changePassword } = await userService();
    const user = await seedUser();
    const originalHash = (await readUser(user._id)).password;

    const err = await captureError(
      changePassword(user._id.toString(), "WrongPass123!", "NewPass456!"),
    );

    expect(err.message).toBe(errMsg.INVALID_OLD_PASSWORD.en);
    expect(err.statusCode).toBe(400);
    expect((await readUser(user._id)).password).toBe(originalHash);
  });

  it("refuses to re-set the same password", async () => {
    const { changePassword } = await userService();
    const user = await seedUser();

    const err = await captureError(
      changePassword(user._id.toString(), PLAIN_PASSWORD, PLAIN_PASSWORD),
    );

    expect(err.message).toBe(errMsg.SAME_PASSWORD_ERROR.en);
  });

  it("requires both passwords", async () => {
    const { changePassword } = await userService();
    const user = await seedUser();

    const err = await captureError(
      changePassword(user._id.toString(), PLAIN_PASSWORD, ""),
    );

    expect(err.message).toBe(errMsg.BOTH_PASSWORDS_REQUIRED.en);
  });

  it("rejects an account that has no password at all", async () => {
    // `password` is required by the schema, so this state can only be reached
    // by a write that bypassed Mongoose — but the branch exists and it must
    // not fall through to bcrypt.compare(x, undefined), which throws a raw
    // TypeError and would surface as a 500.
    const { changePassword } = await userService();
    const user = await seedUser();
    await Users.collection.updateOne(
      { _id: user._id },
      { $unset: { password: "" } },
    );

    const err = await captureError(
      changePassword(user._id.toString(), PLAIN_PASSWORD, "NewPass456!"),
    );

    expect(err.message).toBe(errMsg.USER_HAS_NO_PASSWORD.en);
  });

  it("rejects an unknown user", async () => {
    const { changePassword } = await userService();

    const err = await captureError(
      changePassword(
        new mongoose.Types.ObjectId().toString(),
        PLAIN_PASSWORD,
        "NewPass456!",
      ),
    );

    expect(err.message).toBe(errMsg.USER_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });
});
