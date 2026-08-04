import { SuccessResponse } from "../common/types/controller-response.types";
import { IRole } from "../models/Role";
import * as roleService from "../services/role.service";
import { RequestHandler } from "express";

/** No response payload beyond the message — `{}` would accept any non-nullish value. */
type Empty = Record<string, never>;

export const createRoleHandler: RequestHandler<
  unknown,
  SuccessResponse<Empty>,
  Pick<IRole, "name" | "permissions">
> = async (req, res) => {
  const { name, permissions } = req.body;

  await roleService.createRole({
    name,
    permissions,
  });
  res.status(201).json({
    message: "Role created successfully",
    data: {},
  });
};

export const getRoleByIdHandler: RequestHandler<
  { id: string },
  SuccessResponse<IRole>,
  unknown
> = async (req, res) => {
  const role = await roleService.getRoleById(req.params.id);
  res.status(200).json({
    message: "Role fetched successfully",
    data: role,
  });
};

export const getRolesHandler: RequestHandler<
  unknown,
  SuccessResponse<IRole[]>,
  unknown
> = async (req, res) => {
  const roles = await roleService.getAllRoles(req.user?.role);
  res.status(200).json({
    message: "Roles fetched successfully",
    data: roles,
  });
};

export const updateRoleHandler: RequestHandler<
  { id: string },
  SuccessResponse<IRole>,
  Partial<Pick<IRole, "name" | "permissions">>
> = async (req, res) => {
  const role = await roleService.updateRole(req.params.id, req.body);
  res.status(200).json({
    message: "Role updated successfully",
    data: role,
  });
};

export const deleteRoleHandler: RequestHandler<
  { id: string },
  SuccessResponse<Empty>,
  unknown
> = async (req, res) => {
  await roleService.deleteRole(req.params.id);
  res.status(200).json({
    message: "Role deleted successfully",
    data: {},
  });
};
