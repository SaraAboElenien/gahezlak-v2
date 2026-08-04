import { FilterQuery } from "mongoose";
import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { IRole, Role, Roles } from "../models/Role";

export async function createRole(
  roleData: Pick<IRole, "name" | "permissions">,
) {
  const role = await Roles.create(roleData);
  return role;
}

export async function getRoleById(roleId: string) {
  const role = await Roles.findById(roleId).lean();
  if (!role) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }
  return role;
}

export async function getAllRoles(currentRole?: string) {
  //currentRole is the role of the user who is requesting the roles
  const query: FilterQuery<IRole> = {};
  if (currentRole === Role.SHOP_OWNER) {
    query.name = { $nin: [Role.ADMIN, Role.SHOP_OWNER, Role.USER] };
  }

  const roles = await Roles.find(query).lean();
  return roles;
}

export async function updateRole(roleId: string, roleData: Partial<IRole>) {
  const role = await Roles.findByIdAndUpdate(roleId, roleData, {
    new: true,
  }).lean();

  if (!role) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }
  return role;
}

export async function deleteRole(roleId: string) {
  const role = await Roles.findByIdAndDelete(roleId).lean();
  if (!role) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }
  return role;
}
