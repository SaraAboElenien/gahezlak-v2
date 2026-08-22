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

/**
 * Roles a shop may never hand out to one of its members.
 *
 * `admin` is the platform administrator; `shop_owner` is conferred by creating
 * a shop, not by being added to one; `user` is the ordinary customer role and
 * is not a staff position.
 *
 * This list used to exist only inside `getAllRoles` below, where it filtered
 * the dropdown a shop owner picks from — which made it advisory. The two places
 * that actually *assign* a role (`registerShopMember` and `updateMemberRole`
 * in `shop.service.ts`) checked only that the id resolved to a real role, and
 * `shop.validator.ts` validates `roleId` with `isMongoId()` alone. Posting the
 * admin role's `_id` directly therefore created a pre-verified admin account
 * with an attacker-chosen password — a privilege escalation available to every
 * shop owner on the platform, hidden behind a UI that simply never offered the
 * option.
 *
 * Exported so the filter and the two guards cannot drift apart again.
 */
export const NON_ASSIGNABLE_MEMBER_ROLES = [
  Role.ADMIN,
  Role.SHOP_OWNER,
  Role.USER,
] as const;

/** May `roleName` be given to a shop member? Enforced at every assignment site. */
export function isAssignableMemberRole(roleName: string): boolean {
  return !(NON_ASSIGNABLE_MEMBER_ROLES as readonly string[]).includes(roleName);
}

export async function getAllRoles(currentRole?: string) {
  //currentRole is the role of the user who is requesting the roles
  const query: FilterQuery<IRole> = {};
  if (currentRole === Role.SHOP_OWNER) {
    query.name = { $nin: [...NON_ASSIGNABLE_MEMBER_ROLES] };
  }

  const roles = await Roles.find(query).lean();
  return roles;
}

/**
 * Fields `updateRole` will write, and the complete list of them.
 *
 * `updateRoleHandler` hands `req.body` straight through, and express-validator
 * checks the fields it names without stripping the ones it does not — so
 * whatever the client sends arrives here as a `Partial<IRole>`, `_id`
 * included. Round-tripping a fetched object (GET the role, change the name,
 * PUT the whole thing back) is the obvious way to drive this endpoint and does
 * exactly that, and Mongoose answers an update carrying `_id` with a
 * driver-level "would modify the immutable field '_id'" error — not a
 * CustomError, so a 500.
 *
 * `name` and `permissions` are the entire editable surface of a role, so this
 * list drops nothing a caller may legitimately set; both are pinned by a test
 * asserting an ordinary edit still persists, alongside the one asserting `_id`
 * is ignored.
 */
const UPDATABLE_ROLE_FIELDS = [
  "name",
  "permissions",
] as const satisfies readonly (keyof IRole)[];

function pickUpdatableRoleFields(roleData: Partial<IRole>): Partial<IRole> {
  const updates: Partial<IRole> = {};
  for (const field of UPDATABLE_ROLE_FIELDS) {
    const value = roleData[field];
    if (value !== undefined) {
      // TypeScript cannot correlate the key with its value type while `field`
      // ranges over a union of keys, so it widens the target to `never`. The
      // assignment is sound — the same `field` indexes both objects.
      (updates as Record<string, unknown>)[field] = value;
    }
  }
  return updates;
}

export async function updateRole(roleId: string, roleData: Partial<IRole>) {
  const role = await Roles.findByIdAndUpdate(
    roleId,
    pickUpdatableRoleFields(roleData),
    {
      new: true,
    },
  ).lean();

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
