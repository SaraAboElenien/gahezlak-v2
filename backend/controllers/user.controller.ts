import { RequestHandler } from "express";
import { SuccessResponse } from "../common/types/controller-response.types";
import { requireUser } from "../utils/current-user";
import {
  requestEmailChange,
  confirmEmailChange,
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  getUserByIdAdmin,
  changePassword,
} from "../services/user.service";

/** No route params / no request body — `{}` would accept any non-nullish value. */
type Empty = Record<string, never>;

export const requestEmailChangeHandler: RequestHandler<
  Empty,
  SuccessResponse<Empty>,
  { newEmail: string }
> = async (req, res) => {
  const { userId } = requireUser(req);
  await requestEmailChange(userId, req.body.newEmail);
  res.status(200).json({
    message: "A confirmation code has been sent to your new email.",
    data: {},
  });
};

export const confirmEmailChangeHandler: RequestHandler<
  Empty,
  SuccessResponse<Awaited<ReturnType<typeof confirmEmailChange>>>,
  { code: string }
> = async (req, res) => {
  const { userId } = requireUser(req);
  const result = await confirmEmailChange(userId, req.body.code);
  res.status(200).json({
    message: "Email has been updated successfully.",
    data: result,
  });
};

export const getUserProfileHandler: RequestHandler<
  Empty,
  SuccessResponse<Awaited<ReturnType<typeof getUserProfile>>>,
  Empty
> = async (req, res) => {
  const { userId } = requireUser(req);
  const userProfile = await getUserProfile(userId);
  res.status(200).json({
    message: "User profile retrieved successfully",
    data: userProfile,
  });
};

export const updateUserProfileHandler: RequestHandler<
  Empty,
  SuccessResponse<Awaited<ReturnType<typeof updateUserProfile>>>,
  { firstName?: string; lastName?: string; phoneNumber?: string }
> = async (req, res) => {
  const { userId } = requireUser(req);
  const result = await updateUserProfile(userId, req.body);
  res.status(200).json({
    message: "Profile updated successfully",
    data: result,
  });
};

export const getAllUsersHandler: RequestHandler<
  Empty,
  SuccessResponse<Awaited<ReturnType<typeof getAllUsers>>>,
  Empty,
  { page?: string; limit?: string; search?: string }
> = async (req, res) => {
  const { page = "1", limit = "10", search } = req.query;
  const result = await getAllUsers(parseInt(page), parseInt(limit), search);
  res.status(200).json({
    message: "Users retrieved successfully",
    data: result,
  });
};

export const getUserByIdHandler: RequestHandler<
  { id: string },
  SuccessResponse<Awaited<ReturnType<typeof getUserByIdAdmin>>>,
  Empty
> = async (req, res) => {
  const { id } = req.params;
  const user = await getUserByIdAdmin(id);
  res.status(200).json({
    message: "User retrieved successfully",
    data: user,
  });
};

export const changePasswordHandler: RequestHandler<
  Empty,
  SuccessResponse<Empty>,
  {
    oldPassword: string;
    newPassword: string;
  }
> = async (req, res) => {
  const { userId } = requireUser(req);
  const { oldPassword, newPassword } = req.body;

  await changePassword(userId, oldPassword, newPassword);

  res.status(200).json({
    message: "Password changed successfully",
    data: {},
  });
};
