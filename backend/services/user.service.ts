import { FilterQuery } from "mongoose";
import {
  EMPTY_OTP_SLOT,
  HIDDEN_USER_PROJECTION,
  IUser,
  Users,
} from "../models/User";
import { sendEmail } from "../utils/send-email";
import otpGenerator from "otp-generator";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import bcrypt from "bcryptjs";
import { SALT_ROUNDS } from "../config/bcrypt";
import { escapeRegex } from "../utils/escape-regex";

export async function requestEmailChange(userId: string, newEmail: string) {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  const emailExists = await Users.findOne({ email: newEmail.toLowerCase() });
  if (emailExists) {
    throw new Errors.BadRequestError(errMsg.EMAIL_ALREADY_IN_USE);
  }

  // Generate code for email change
  const code = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
  });
  const expireAt = new Date(Date.now() + 10 * 60 * 1000);

  // Send BEFORE persisting, deliberately.
  //
  // The order used to be the other way round, and the failure path threw after
  // the write had already landed: a relay outage left the account carrying a
  // pending `newEmail` and a live OTP that the person never asked to confirm,
  // could not see, and had no way to clear — the profile then advertised a
  // change to an address they may never have wanted. Nothing in the app
  // cancels a pending change.
  //
  // The code is generated in memory, so nothing has to exist in the database
  // for the mail to be correct. Sending first inverts the residue: if the save
  // fails after a successful send, the user holds a code that simply does not
  // work and retries — which is the recoverable direction, and the one the
  // person can act on.
  const checkEmail = await sendEmail(
    newEmail,
    "Email Change Confirmation",
    `Your email change confirmation code is: <b>${code}</b>. It will expire in 10 minutes.`,
  );
  if (!checkEmail) {
    throw new Errors.BadRequestError(errMsg.FAILED_TO_SEND_EMAIL);
  }

  // Its own slot (see models/User.ts): requesting an email change no longer
  // wipes a password-reset or account-verification code that is in flight.
  user.emailChangeCode = { code, expireAt, reason: "email_change" };
  user.newEmail = newEmail.toLowerCase();
  await user.save();

  return { message: "A confirmation code has been sent to your new email." };
}

export async function confirmEmailChange(userId: string, code: string) {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  const vCode = user.emailChangeCode;
  const newEmail = user.newEmail;
  if (!vCode?.code || !vCode.expireAt || !vCode.reason || !newEmail) {
    throw new Errors.BadRequestError(errMsg.NO_EMAIL_CHANGE_REQUEST_FOUND);
  }
  if (vCode.code !== code) {
    throw new Errors.BadRequestError(errMsg.INVALID_CONFIRMATION_CODE);
  }
  // Retained even though the slot now identifies the flow — see models/User.ts.
  if (vCode.reason !== "email_change") {
    throw new Errors.BadRequestError(errMsg.INVALID_CONFIRMATION_REASON);
  }
  if (new Date() > new Date(vCode.expireAt)) {
    throw new Errors.BadRequestError(errMsg.CONFIRMATION_CODE_EXPIRED);
  }

  // Uniqueness was checked when the change was *requested*, and the request
  // stays valid for ten minutes — long enough for anyone to sign up with the
  // same address in the meantime. Without this recheck the collision is only
  // discovered by the unique index during save(), and escapes as a raw driver
  // error ("Plan executor error during update :: caused by :: E11000 …")
  // rather than a domain error: the message leaks a collection and index name,
  // and the wrapped form is not the shape the global handler's duplicate-key
  // branch sniffs for, so it lands in the 500 catch-all.
  //
  // Deliberately placed *after* the code checks, so this cannot be used to
  // probe whether an address is registered without holding a valid code.
  const emailTaken = await Users.findOne({
    email: newEmail,
    _id: { $ne: user._id },
  });
  if (emailTaken) {
    throw new Errors.BadRequestError(errMsg.EMAIL_ALREADY_IN_USE);
  }

  user.email = newEmail;
  user.newEmail = undefined;
  user.emailChangeCode = { ...EMPTY_OTP_SLOT };
  await user.save();

  return {
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
    },
    message: "Email has been updated successfully.",
  };
}

// Helper function to get user by ID (for other services)
export async function getUserById(userId: string) {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }
  return user;
}

// Get user profile with populated shop data
export async function getUserProfile(userId: string) {
  const user = await Users.findById(userId)
    .populate({
      path: "shop",
      select:
        "name address phoneNumber type email logoUrl subscriptionId createdAt updatedAt",
      populate: {
        path: "subscriptionId",
        select: "status currentPeriodStart currentPeriodEnd plan",
        populate: {
          path: "plan",
          select:
            "planGroup title description price currency frequency features isActive",
        },
      },
    })
    .populate("role", "name")
    .select(HIDDEN_USER_PROJECTION);

  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  return user;
}

// Update user profile
export async function updateUserProfile(
  userId: string,
  updateData: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  },
) {
  const user = await Users.findById(userId);
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  // Update only allowed fields
  if (updateData.firstName) user.firstName = updateData.firstName;
  if (updateData.lastName) user.lastName = updateData.lastName;
  if (updateData.phoneNumber) user.phoneNumber = updateData.phoneNumber;

  await user.save();

  return {
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVerified: user.isVerified,
    },
    message: "Profile updated successfully.",
  };
}

// Get all users (admin only)
export async function getAllUsers(
  page: number = 1,
  limit: number = 10,
  search?: string,
) {
  const skip = (page - 1) * limit;

  const query: FilterQuery<IUser> = {};

  // Add search functionality
  if (search) {
    // Escaped — see utils/escape-regex.ts for why this is not cosmetic.
    const safeSearch = escapeRegex(search);
    query.$or = [
      { firstName: { $regex: safeSearch, $options: "i" } },
      { lastName: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
      { phoneNumber: { $regex: safeSearch, $options: "i" } },
    ];
  }

  const users = await Users.find(query)
    .populate("role", "name")
    .populate("shop", "name  address phoneNumber email ownerId subscriptionId")
    .select(HIDDEN_USER_PROJECTION)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await Users.countDocuments(query);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// Get user by ID (admin only)
export async function getUserByIdAdmin(userId: string) {
  const user = await Users.findById(userId)
    .populate("role", "name")
    .populate("shop", "name  address phoneNumber email ownerId subscriptionId")
    .select(HIDDEN_USER_PROJECTION);

  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  return user;
}

// Change password for logged-in user
export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
) {
  // Always select password explicitly for password operations
  const user = await Users.findById(userId).select("+password");
  if (!user) {
    throw new Errors.NotFoundError(errMsg.USER_NOT_FOUND);
  }

  if (!user.password) {
    throw new Errors.BadRequestError(errMsg.USER_HAS_NO_PASSWORD);
  }
  if (!oldPassword || !newPassword) {
    throw new Errors.BadRequestError(errMsg.BOTH_PASSWORDS_REQUIRED);
  }

  // Verify old password using bcrypt.compare
  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
  if (!isOldPasswordValid) {
    throw new Errors.BadRequestError(errMsg.INVALID_OLD_PASSWORD);
  }

  // Check if new password is different from old password using bcrypt.compare
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new Errors.BadRequestError(errMsg.SAME_PASSWORD_ERROR);
  }

  // Hash new password
  const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password
  user.password = hashedNewPassword;

  // Revoke the refresh token along with the old password. `Users.refreshToken`
  // is the server side of the httpOnly refresh cookie — auth.service's
  // refreshToken() mints a fresh hour-long access token for anyone presenting
  // a cookie that still equals this field. Leaving it in place meant a
  // password change, the action a person takes precisely *because* they think
  // someone else has their session, revoked nothing: the other session kept
  // refreshing itself indefinitely. Clearing it makes every session that is
  // not the current one unusable at its next refresh.
  user.refreshToken = "";

  await user.save();

  return {
    message: "Password changed successfully.",
  };
}
