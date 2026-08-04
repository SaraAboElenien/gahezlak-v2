// Only the access token is ever returned in a response body. The refresh
// token is set by the backend as an httpOnly cookie, which JS cannot read —
// that's the whole point, so there is deliberately no `refreshToken` field
// here.
export interface AccessTokenPayload {
  accessToken: string;
}

// The user object embedded in login/verify-code responses is a reduced
// projection, not the full UserProfile (see types/user.ts) — and the two
// endpoints don't even agree with each other on `id` vs `_id`. This is a
// pre-existing backend inconsistency (auth.service.ts's login() vs
// verifyCode() build their `user` object differently), not something this
// typing pass introduces or attempts to fix.
export interface LoginResponseUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  shop?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerifyCodeResponseUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  isVerified: boolean;
  shop?: string | null;
}

// Several auth endpoints return no meaningful data, just a message.
export interface EmptyDataResponse {
  message: string;
  data: Record<string, never>;
}

export interface LoginResponse {
  message: string;
  data: AccessTokenPayload & { user: LoginResponseUser };
}

export interface VerifyCodeResponse {
  message: string;
  data: AccessTokenPayload & { user: VerifyCodeResponseUser };
}

export interface RefreshTokenResponse {
  message: string;
  data: AccessTokenPayload;
}
