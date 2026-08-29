import { RequestHandler } from "express";
import { SuccessResponse } from "../common/types/controller-response.types";
import {
  signUp,
  verifyCode,
  resendVerificationCode,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
  signOut,
} from "../services/auth.service";
import {
  REFRESH_TOKEN_COOKIE,
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from "../config/cookies";
import { requireUser } from "../utils/current-user";

// Request bodies and response payloads are derived from the service
// signatures rather than re-declared, so the two can't drift apart.
type SignUpBody = Parameters<typeof signUp>[0];
type VerifyCodeBody = Parameters<typeof verifyCode>[0];
type ResendVerificationCodeBody = Parameters<typeof resendVerificationCode>[0];
type LoginBody = Parameters<typeof login>[0];
type ForgotPasswordBody = Parameters<typeof forgotPassword>[0];
type ResetPasswordBody = Parameters<typeof resetPassword>[0];

type NoParams = Record<string, never>;
type EmptyData = Record<string, never>;

// The refresh token never appears in a response body — it is set as an
// httpOnly cookie instead (config/cookies.ts) so browser JS can't read it.
type LoginResult = Omit<Awaited<ReturnType<typeof login>>, "refreshToken">;
type VerifyCodeResult = Omit<
  Awaited<ReturnType<typeof verifyCode>>,
  "refreshToken"
>;
type RefreshResult = { accessToken: string };

type SignUpResult = Awaited<ReturnType<typeof signUp>>;

export const signUpHandler: RequestHandler<
  NoParams,
  SuccessResponse<SignUpResult>,
  SignUpBody
> = async (req, res) => {
  const result = await signUp(req.body);
  // The message still assumes success; `data.verificationEmailSent` is what
  // lets a client say otherwise. Telling someone to check an inbox that will
  // never receive anything removes their reason to act — they wait, check
  // spam, and conclude the product is broken, while the unverified row blocks
  // them from re-registering the same address. See the note in signUp for why
  // branching on delivery is safe on THIS endpoint and on no other.
  res.status(201).json({
    message:
      "Registration successful! Please check your email for the verification code.",
    data: result,
  });
};

export const verifyCodeHandler: RequestHandler<
  NoParams,
  SuccessResponse<VerifyCodeResult>,
  VerifyCodeBody
> = async (req, res) => {
  const { refreshToken: newRefreshToken, ...result } = await verifyCode(
    req.body,
  );

  setRefreshTokenCookie(res, newRefreshToken);

  res.status(200).json({
    message: "Verification successful. You are now logged in.",
    data: result,
  });
};

export const resendVerificationCodeHandler: RequestHandler<
  NoParams,
  SuccessResponse<EmptyData>,
  ResendVerificationCodeBody
> = async (req, res) => {
  await resendVerificationCode(req.body);
  res.status(200).json({
    message: "A new verification code has been sent to your email.",
    data: {},
  });
};

export const loginHandler: RequestHandler<
  NoParams,
  SuccessResponse<LoginResult>,
  LoginBody
> = async (req, res) => {
  const { refreshToken: newRefreshToken, ...result } = await login(req.body);

  setRefreshTokenCookie(res, newRefreshToken);

  res.status(200).json({
    message: "Login successful",
    data: result,
  });
};

export const forgotPasswordHandler: RequestHandler<
  NoParams,
  SuccessResponse<EmptyData>,
  ForgotPasswordBody
> = async (req, res) => {
  await forgotPassword(req.body);
  res.status(200).json({
    message: "A password reset code has been sent to your email.",
    data: {},
  });
};

export const resetPasswordHandler: RequestHandler<
  NoParams,
  SuccessResponse<EmptyData>,
  ResetPasswordBody
> = async (req, res) => {
  await resetPassword(req.body);
  res.status(200).json({
    message: "Password has been reset successfully.",
    data: {},
  });
};

/**
 * The presented refresh token comes from the httpOnly cookie, never the
 * request body. The service rotates it, so the freshly issued one has to be
 * written back to the cookie; only the new access token goes to the client,
 * which keeps it in memory.
 */
export const refreshTokenHandler: RequestHandler<
  NoParams,
  SuccessResponse<RefreshResult>,
  EmptyData
> = async (req, res) => {
  const presentedToken: string | undefined =
    req.cookies?.[REFRESH_TOKEN_COOKIE];

  const { accessToken, refreshToken: rotatedRefreshToken } =
    await refreshToken(presentedToken);

  setRefreshTokenCookie(res, rotatedRefreshToken);

  res.status(200).json({
    message: "Token refreshed successfully",
    data: { accessToken },
  });
};

export const signOutHandler: RequestHandler<
  NoParams,
  SuccessResponse<EmptyData>,
  EmptyData
> = async (req, res) => {
  // `protect` guarantees req.user; requireUser turns a middleware-ordering
  // mistake into an honest 401 instead of handing signOut() an undefined id.
  const { userId } = requireUser(req);

  await signOut(userId);

  // Must happen even though the stored token is already cleared server-side:
  // a cookie left in the browser would keep being sent on every /auth call.
  clearRefreshTokenCookie(res);

  res.status(200).json({
    message: "Successfully signed out from all devices.",
    data: {},
  });
};
