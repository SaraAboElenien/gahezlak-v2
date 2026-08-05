import { hash, compare } from "bcryptjs";
import { SALT_ROUNDS } from "../config/bcrypt";
import { IUser, Users } from "../models/User";
import { sendEmail } from "../utils/send-email";
import otpGenerator from "otp-generator";
import jwt from "jsonwebtoken";
import { IRole, Role, Roles } from "../models/Role";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../config/cookies";

// Fields that must never leave the server in an API response.
const SENSITIVE_USER_FIELDS = [
  "password",
  "role",
  "verificationCode",
  "refreshToken",
  "newEmail",
] as const;

type SensitiveUserField = (typeof SENSITIVE_USER_FIELDS)[number];

/**
 * Strips credential/internal fields off a lean user document before it is
 * returned to the client.
 */
function omitSensitiveUserFields<T extends object>(
  user: T,
): Omit<T, SensitiveUserField> {
  const sanitized = { ...user } as Record<string, unknown>;
  for (const field of SENSITIVE_USER_FIELDS) {
    delete sanitized[field];
  }
  return sanitized as Omit<T, SensitiveUserField>;
}

// Utility functions

/**
 * Looks a user up by email, returning `null` when there is no match.
 *
 * Use this — not `findUserByEmail` — on any endpoint an unauthenticated caller
 * can reach with an arbitrary address. Throwing USER_NOT_FOUND there turns the
 * endpoint into an oracle for "is this address registered", which is the input
 * to credential stuffing and targeted phishing.
 */
async function findUserByEmailOrNull(
  email: string,
  includePassword = false,
  includeRole = true,
  includeShop = true,
) {
  const normalizedEmail = email.toLowerCase();
  let query = Users.findOne({ email: normalizedEmail });

  if (includePassword) {
    query = query.select("+password");
  }

  if (includeRole) {
    query = query.populate("role");
  }

  if (includeShop) {
    query = query.populate("shop");
  }

  return query.lean();
}

async function findUserByEmail(
  email: string,
  includePassword = false,
  includeRole = true,
  includeShop = true,
) {
  const user = await findUserByEmailOrNull(
    email,
    includePassword,
    includeRole,
    includeShop,
  );
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }
  return user;
}

/**
 * A bcrypt hash of a value no user can hold, compared against when the supplied
 * address is not registered. Without it the unknown-address path skips bcrypt
 * entirely and answers in a fraction of the time a real comparison takes, which
 * leaves the enumeration oracle open on the clock even once the error bodies
 * match. Computed once, lazily, at the configured cost factor.
 */
let dummyPasswordHash: Promise<string> | null = null;
function getDummyPasswordHash() {
  dummyPasswordHash ??= hash("not-a-real-password", SALT_ROUNDS);
  return dummyPasswordHash;
}

async function generateVerificationCode(
  reason: "account_verification" | "password_reset",
) {
  const code = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
  });
  const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  return {
    code,
    expireAt,
    reason,
  };
}

export async function signUp(userData: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
}) {
  const { firstName, lastName, email, password, phoneNumber } = userData;

  // Hash password
  const hashedPassword = await hash(password, SALT_ROUNDS);

  const userRole = await Roles.findOne({ name: Role.USER });
  if (!userRole) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }

  // Generate verification code
  const code = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
  });
  const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
  const reason = "account_verification";

  const newUser = {
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: hashedPassword,
    phoneNumber,
    verificationCode: {
      code,
      expireAt,
      reason,
    },
    role: userRole._id,
  };

  // Create user in database. The created document is intentionally not
  // returned: the caller (signUpHandler) responds with an empty data object,
  // and spreading a Mongoose document here never produced usable fields
  // anyway (schema paths live on the prototype, not as own properties).
  await Users.create(newUser);

  // Send verification email only after successful user creation in a separate thread

  await sendEmail(
    email,
    "Your Verification Code",
    `Your verification code is: <b>${code}</b>. It will expire in 10 minutes.`,
  ).catch(console.error);
}

/**
 * The only OTP reason this endpoint will honour. Both flows write to the same
 * single `verificationCode` slot on the user, so without this check a
 * password_reset code satisfied every remaining test here and was exchanged for
 * a full session — a reset code became a login credential, and the reset flow
 * doubled as an email-verification bypass for someone who never set a password.
 * A reset code authorises `resetPassword` and nothing else.
 */
const VERIFIABLE_REASON = "account_verification";

export async function verifyCode(verificationData: {
  email: string;
  code: string;
  reason: string;
}) {
  const { code, reason } = verificationData;

  if (reason !== VERIFIABLE_REASON) {
    throw new Errors.BadRequestError(errMsg.INVALID_VERIFICATION_REASON);
  }

  const user = await findUserByEmail(verificationData.email);

  const vCode = user.verificationCode;
  if (!vCode.code || !vCode.expireAt || !vCode.reason) {
    throw new Errors.BadRequestError(errMsg.NO_VERIFICATION_CODE_FOUND);
  }
  if (vCode.code !== code) {
    throw new Errors.BadRequestError(errMsg.INVALID_VERIFICATION_CODE);
  }
  if (vCode.reason !== reason) {
    throw new Errors.BadRequestError(errMsg.INVALID_VERIFICATION_REASON);
  }
  if (new Date() > new Date(vCode.expireAt)) {
    throw new Errors.BadRequestError(errMsg.VERIFICATION_CODE_EXPIRED);
  }

  const { accessToken, refreshToken } = await generateTokens(user);

  // Combine updates into a single operation
  await Users.findByIdAndUpdate(user._id, {
    $set: {
      isVerified: true,
      verificationCode: { code: null, expireAt: null, reason: null },
      refreshToken,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVerified: true,
      shop: user.shop,
    },
  };
}

export async function resendVerificationCode(userData: { email: string }) {
  // Same answer in all three cases — unregistered, already verified, and
  // genuinely resent. Previously these were 404, 400 and 200 respectively,
  // which let an anonymous caller not only test whether an address was
  // registered but also read back its verification state.
  const genericResponse = {
    message: "A new verification code has been sent to your email.",
  };

  const user = await findUserByEmailOrNull(userData.email);

  // The guard that matters is unchanged, only its visibility: an already-
  // verified account must never have a fresh OTP written onto it and mailed
  // out, or an anonymous caller could keep re-arming a live account's
  // verification slot indefinitely. Doing nothing and reporting success is
  // what keeps that protection without announcing which case applied.
  if (!user || user.isVerified) {
    return genericResponse;
  }

  const verificationCode = await generateVerificationCode(
    "account_verification",
  );

  // Combine into single operation
  await Users.findByIdAndUpdate(user._id, {
    $set: { verificationCode },
  });

  // Deliberately awaited rather than fire-and-forget: a user whose mail
  // genuinely fails to send should be told, rather than being left waiting for
  // a code that was never dispatched. The residual signal this leaves — a
  // broken mail transport would fail for real addresses while unknown ones
  // still return 200 — needs SMTP to be down to say anything, and is not
  // something an attacker can provoke per-address.
  await sendEmail(
    user.email,
    "Your New Verification Code",
    `Your new verification code is: <b>${verificationCode.code}</b>. It will expire in 10 minutes.`,
  );

  return genericResponse;
}

export async function login(loginData: { email: string; password: string }) {
  const { email, password } = loginData;

  // Find user with password included
  const user = await findUserByEmailOrNull(email, true);

  // An unregistered address and a registered one with the wrong password must
  // be indistinguishable — same error, same status, same body, and (via the
  // dummy hash) the same amount of work. Anything else lets an anonymous caller
  // enumerate the user base one address at a time.
  const isMatch = await compare(
    password,
    user ? user.password : await getDummyPasswordHash(),
  );
  if (!user || !isMatch) {
    throw new Errors.UnauthorizedError(errMsg.INVALID_EMAIL_OR_PASSWORD);
  }

  // Deliberately *after* the password check: answering "this account is not
  // verified" to someone who has not proved they own the credentials would
  // reinstate the same oracle the check above closes.
  if (!user.isVerified) {
    throw new Errors.UnauthenticatedError(errMsg.ACCOUNT_NOT_VERIFIED);
  }

  const { accessToken, refreshToken } = await generateTokens(user);

  // Update refresh token in single operation
  await Users.findByIdAndUpdate(user._id, { refreshToken });

  return {
    accessToken,
    refreshToken,
    user: omitSensitiveUserFields(user),
  };
}

export async function forgotPassword(userData: { email: string }) {
  // The same answer is returned whether or not the address is registered. This
  // endpoint needs no credentials at all, so a 404 here would hand anyone a
  // free membership check against the whole user base.
  const genericResponse = {
    message: "A password reset code has been sent to your email.",
  };

  const user = await findUserByEmailOrNull(userData.email);
  if (!user) {
    return genericResponse;
  }

  const verificationCode = await generateVerificationCode("password_reset");

  await Users.findByIdAndUpdate(user._id, {
    $set: { verificationCode },
  });

  await sendEmail(
    user.email,
    "Your Password Reset Code",
    `Your password reset code is: <b>${verificationCode.code}</b>. It will expire in 10 minutes.`,
  );

  return genericResponse;
}

export async function resetPassword(resetData: {
  email: string;
  code: string;
  newPassword: string;
}) {
  const { code, newPassword } = resetData;
  const email = resetData.email.toLowerCase();
  const user = await Users.findOne({ email }).lean();
  // An unregistered address gets the same answer as a registered one with no
  // reset pending — both are truthfully "there is no reset code for this
  // address". A 404 here would undo the generic response forgotPassword now
  // returns, since an attacker could just enumerate through this endpoint.
  if (!user) {
    throw new Errors.BadRequestError(errMsg.NO_VERIFICATION_CODE_FOUND);
  }

  const vCode = user.verificationCode;
  if (!vCode.code || !vCode.expireAt || !vCode.reason) {
    throw new Errors.BadRequestError(errMsg.NO_VERIFICATION_CODE_FOUND);
  }
  if (vCode.code !== code) {
    throw new Errors.BadRequestError(errMsg.INVALID_VERIFICATION_CODE);
  }
  if (vCode.reason !== "password_reset") {
    throw new Errors.BadRequestError(errMsg.INVALID_VERIFICATION_REASON);
  }
  if (new Date() > new Date(vCode.expireAt)) {
    throw new Errors.BadRequestError(errMsg.VERIFICATION_CODE_EXPIRED);
  }

  const hashedPassword = await hash(newPassword, SALT_ROUNDS);

  await Users.findByIdAndUpdate(user._id, {
    $set: {
      password: hashedPassword,
      verificationCode: { code: null, expireAt: null, reason: null },
      refreshToken: "",
    },
  });

  return { message: "Password has been reset successfully." };
}

/**
 * Rotates the refresh token: the presented token is verified against the copy
 * stored on the user, then immediately replaced, so a token can only ever be
 * redeemed once. The caller is responsible for putting the new refresh token
 * back into the httpOnly cookie (see config/cookies.ts).
 */
export async function refreshToken(refreshTokenValue: string | undefined) {
  if (!refreshTokenValue) {
    throw new Errors.UnauthenticatedError(errMsg.REFRESH_TOKEN_REQUIRED);
  }

  try {
    const decoded = jwt.verify(refreshTokenValue, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
    };

    const user = await Users.findById(decoded.userId)
      .populate("role")
      .populate("shop")
      .lean();
    if (!user || user.refreshToken !== refreshTokenValue) {
      throw new Errors.UnauthenticatedError(
        errMsg.INVALID_OR_EXPIRED_REFRESH_TOKEN,
      );
    }

    const { accessToken, refreshToken } = await generateTokens(user);

    await Users.findByIdAndUpdate(user._id, { refreshToken });

    return {
      accessToken,
      refreshToken,
    };
  } catch {
    throw new Errors.UnauthenticatedError(
      errMsg.INVALID_OR_EXPIRED_REFRESH_TOKEN,
    );
  }
}

export async function signOut(userId: string) {
  const user = await Users.findByIdAndUpdate(userId, { refreshToken: "" });
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  return { message: "Successfully signed out from all devices." };
}

export async function generateTokens(user: IUser) {
  const accessToken = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: (user.role as IRole)?.name,
      shopId: user.shop?._id.toString(),
    },
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );

  const refreshToken = jwt.sign(
    { userId: user._id.toString(), email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
  );

  return {
    accessToken,
    refreshToken,
  };
}
