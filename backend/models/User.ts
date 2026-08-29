import mongoose, { Schema, model, ObjectId } from "mongoose";
import { collectionsName } from "../common/collections-name";
import { IShop } from "./Shop";
import { IRole } from "./Role";

/**
 * One-time code slot. `reason` is retained on each slot even though the slot
 * itself now identifies the flow — see the OTP note below.
 */
export interface IOtpSlot {
  code: string | null;
  expireAt: Date | null;
  reason: string | null;
}

/** An empty slot, i.e. "no code outstanding for this flow". */
export const EMPTY_OTP_SLOT: IOtpSlot = {
  code: null,
  expireAt: null,
  reason: null,
};

export interface IUser {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber: string;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Account-verification OTP. Written by `signUp` / `resendVerificationCode`,
   * consumed by `verifyCode`.
   */
  verificationCode: IOtpSlot;
  /** Password-reset OTP. Written by `forgotPassword`, consumed by `resetPassword`. */
  passwordResetCode: IOtpSlot;
  /** Email-change OTP. Written by `requestEmailChange`, consumed by `confirmEmailChange`. */
  emailChangeCode: IOtpSlot;
  isVerified: boolean;
  newEmail?: string | null;
  role: mongoose.Types.ObjectId | IRole;
  refreshToken: string;
  shop: mongoose.Types.ObjectId | IShop;
}

const otpSlotSchema = {
  code: { type: String, default: null },
  expireAt: { type: Date, default: null },
  reason: { type: String, default: null },
};

/**
 * The three OTP flows get one slot each, deliberately.
 *
 * They used to share a single `verificationCode` sub-document, so issuing any
 * one code destroyed any other that was outstanding: requesting an email change
 * while a password reset was in flight silently invalidated the reset code the
 * user was at that moment reading out of their inbox. Nothing told them, and
 * the natural response — ask for another one — is what caused it. It is also
 * exactly the kind of thing that gets investigated as a mail-delivery problem.
 *
 * Consumption was never the hole (every consumer checks `reason`, and there are
 * tests for that); the clobbering was. Separate slots fix it structurally, so
 * the guarantee no longer depends on remembering to check.
 *
 * Two naming notes for whoever reads this next:
 *
 * - `verificationCode` keeps its name rather than becoming
 *   `accountVerificationCode`. It is the slot the existing field already held,
 *   so the old documents, the E2E control endpoint and the frontend type all
 *   stay correct; renaming it would have bought symmetry at the cost of a
 *   migration and a cross-package edit.
 * - `reason` is kept on every slot even though the slot name now implies it.
 *   It is defence in depth: the consumers still check it, those checks are
 *   tested, and a future write to the wrong slot fails closed instead of
 *   silently authorising the wrong flow.
 */
const UserSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    phoneNumber: { type: String, required: true },
    verificationCode: otpSlotSchema,
    passwordResetCode: otpSlotSchema,
    emailChangeCode: otpSlotSchema,
    isVerified: { type: Boolean, default: false },
    newEmail: { type: String, default: null },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: collectionsName.ROLES,
      required: true,
    },
    refreshToken: { type: String, default: "" },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: collectionsName.SHOPS,
    },
  },
  {
    timestamps: true,
    collection: collectionsName.USERS,
  },
);

export const Users = model<IUser>(collectionsName.USERS, UserSchema);

/**
 * User fields that must never reach a client, on any read path.
 *
 * Stated once, here, rather than repeated in each caller's `.select()` string.
 * The three admin/profile read paths in `user.service.ts` had drifted apart —
 * `getUserProfile` stripped `newEmail` (the pending, unconfirmed address of an
 * in-flight email change) while `getAllUsers` and `getUserByIdAdmin` did not —
 * which left the next person to add a read path two contradictory examples to
 * copy. Adding the two new OTP slots made a single definition load-bearing
 * rather than merely tidy: a projection that names fields individually silently
 * fails to strip any field added after it was written, and these hold live
 * one-time codes.
 *
 * `role` is deliberately absent: it is populated and returned on purpose.
 */
export const HIDDEN_USER_FIELDS = [
  "password",
  "refreshToken",
  "verificationCode",
  "passwordResetCode",
  "emailChangeCode",
  "newEmail",
] as const satisfies readonly (keyof IUser)[];

/** The same list as a Mongoose exclusion projection. */
export const HIDDEN_USER_PROJECTION = HIDDEN_USER_FIELDS.map(
  (field) => `-${field}`,
).join(" ");
