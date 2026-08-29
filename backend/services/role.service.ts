import { FilterQuery } from "mongoose";
import { errMsg } from "../common/err-messages";
import { Errors } from "../errors";
import { IRole, Role, Roles } from "../models/Role";
import { Users } from "../models/User";

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

/**
 * Is this a name the platform itself resolves by string, rather than a label
 * an administrator may move around freely?
 *
 * `admin` is the only thing `isAllowed([Role.ADMIN])` matches on; `shop_owner`
 * is what every dashboard gate compares against; `user` is looked up *by name*
 * by `signUp` to stamp new accounts. Each is a literal somewhere in the code,
 * so the string in this collection is not a display name — it is the privilege.
 *
 * Deliberately the same set as `NON_ASSIGNABLE_MEMBER_ROLES` and deliberately
 * derived from it rather than restated: the two questions ("may a shop owner
 * hand this out?" and "is this name load-bearing?") are different, but they
 * have the same answer for the same reason, and two copies of the list would
 * drift the way the assignable list already did once.
 */
function isReservedRoleName(roleName: string): boolean {
  return !isAssignableMemberRole(roleName);
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

/**
 * Renaming a role is a privilege change, not a relabelling.
 *
 * `isAllowed` decides what a request may do by populating `Users.role` and
 * reading `role.name` off it, and `Roles.name` carries no unique index. So
 * renaming the kitchen role to `admin` does not create an administrator — it
 * promotes every cook already holding that role, at once, with nothing in the
 * users collection changing. The obvious-looking action ("fix the label on this
 * role") is the destructive one, and it is available to any admin through the
 * ordinary edit form.
 *
 * Both directions are refused, because both are silent and neither is ever
 * legitimate:
 *
 * - renaming *into* a reserved name grants that privilege to everyone holding
 *   the role;
 * - renaming *out of* one revokes it — and for `user` it is worse than a
 *   revocation, since `signUp` finds that role by name and registration stops
 *   for the whole platform.
 *
 * A no-op rename (the name already stored) is allowed through, so that
 * round-tripping a fetched role — GET, edit `permissions`, PUT the whole object
 * back — still works on the three reserved roles.
 *
 * This is only half the guard. The other half is a unique index on
 * `Roles.name`, which is not added here: it is a data change, not a code
 * change, and an index that fails to build leaves the collection in whatever
 * state it was already in. It needs a migration that first checks production
 * for existing duplicates and decides what to do with them — and duplicates are
 * plausible, because nothing has ever prevented them.
 */
async function assertRenameIsAllowed(roleId: string, newName: Role) {
  const current = await Roles.findById(roleId).lean();
  if (!current) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }
  if (newName === current.name) {
    return;
  }
  if (isReservedRoleName(newName) || isReservedRoleName(current.name)) {
    throw new Errors.BadRequestError(errMsg.ROLE_NAME_RESERVED);
  }
}

export async function updateRole(roleId: string, roleData: Partial<IRole>) {
  const updates = pickUpdatableRoleFields(roleData);

  // Only pay for the extra read when a rename is actually being attempted.
  if (updates.name !== undefined) {
    await assertRenameIsAllowed(roleId, updates.name);
  }

  const role = await Roles.findByIdAndUpdate(roleId, updates, {
    new: true,
  }).lean();

  if (!role) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }
  return role;
}

/**
 * Deleting a role is refused while anything still depends on it.
 *
 * There was no reference check at all, so the role could be removed while users
 * still pointed at it. Their `role` reference is then left dangling, `isAllowed`
 * populates it to `null`, and `!currentRole` sends every gated request to 403 —
 * the accounts still log in, they simply cannot do anything, and nothing
 * anywhere says why. Deleting `user` is worse still: `signUp` looks that role up
 * by name to stamp new accounts, so registration stops for everyone.
 *
 * Refusing is the only one of the three available behaviours that cannot
 * silently destroy access. Orphaning is what happens today; reassigning holders
 * to a fallback role decides someone's permissions on their behalf. Refusing
 * costs the administrator one extra step — move the holders first — and is the
 * only option that is reversible by doing nothing. Same reasoning, and the same
 * failure direction, as `deleteCategory` refusing a non-empty category.
 *
 * The reserved names are refused whether or not anyone currently holds them,
 * since they are resolved by name elsewhere in the code and an empty `user`
 * role is exactly as fatal to registration as a populated one.
 */
export async function deleteRole(roleId: string) {
  const role = await Roles.findById(roleId).lean();
  if (!role) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }

  if (isReservedRoleName(role.name)) {
    throw new Errors.BadRequestError(errMsg.ROLE_NAME_RESERVED);
  }

  const holders = await Users.countDocuments({ role: role._id });
  if (holders > 0) {
    throw new Errors.BadRequestError(errMsg.ROLE_IN_USE);
  }

  await Roles.findByIdAndDelete(roleId);
  return role;
}
