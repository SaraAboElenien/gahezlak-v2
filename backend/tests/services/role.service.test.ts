import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
} from "../db-test-helper";
import { Roles, Role } from "../../models/Role";
import { Users } from "../../models/User";
import { errMsg } from "../../common/err-messages";

/**
 * Service-level coverage for the role service, which had none.
 *
 * Roles are the authorisation primitive of the whole application. `isAllowed`
 * (middlewares/auth.ts) resolves a request's permission by populating
 * `Users.role` and comparing `role.name` against a list of literals — so a
 * `Roles` document is not a label, it *is* the privilege, and everything in
 * this file writes to it.
 *
 * The function that carries the most weight is `getAllRoles`, because of what
 * it is used for rather than what it does: it is the list a shop owner picks
 * from when hiring, and it deliberately withholds `admin`, `shop_owner` and
 * `user` from them. That filter is the only place in the codebase where
 * "which roles may a shop owner hand out" is written down — see the test
 * below for why that is a problem in itself.
 *
 * Deliberately NOT mocked: Mongo. `updateRole`'s handling of an `_id` in the
 * payload, and what `deleteRole` leaves behind for documents that referenced
 * the role, are both properties of the driver rather than of this file's
 * control flow.
 */

const roleService = () => import("../../services/role.service");

type CapturedError = Error & { statusCode?: number; name: string };

/**
 * Awaits a call that is expected to reject and hands back the error itself, so
 * a test can inspect it. Fails loudly if the call resolves.
 */
async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
  try {
    await promise;
  } catch (err) {
    return err as CapturedError;
  }
  throw new Error("expected the call to reject, but it resolved");
}

/** Seeds one document per role in the enum and indexes them by name. */
async function seedAllRoles() {
  const created = await Roles.create(
    Object.values(Role).map((name) => ({ name, permissions: [] })),
  );
  return new Map(created.map((r) => [r.name, r]));
}

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe("createRole", () => {
  it("persists the name and permissions", async () => {
    const { createRole } = await roleService();

    const role = await createRole({
      name: Role.SHOP_MANAGER,
      permissions: ["orders:read"],
    });

    const stored = await Roles.findById(role._id).lean();
    expect(stored).toMatchObject({
      name: Role.SHOP_MANAGER,
      permissions: ["orders:read"],
    });
  });

  it("defaults permissions to an empty array", async () => {
    const { createRole } = await roleService();

    const role = await createRole({
      name: Role.KITCHEN,
    } as Parameters<typeof createRole>[0]);

    expect((await Roles.findById(role._id).lean())!.permissions).toEqual([]);
  });

  it("refuses a name outside the Role enum", async () => {
    // The schema enum is the second of two gates — `createRoleValidator` is
    // the first — and it is the one that also covers any caller reaching the
    // service directly. It matters because `isAllowed` compares against these
    // exact literals: a role named "Admin" or "administrator" would be
    // creatable, assignable, and permanently unable to pass any gate.
    const { createRole } = await roleService();

    const err = await captureError(
      createRole({ name: "superuser" } as unknown as Parameters<
        typeof createRole
      >[0]),
    );

    expect(err.name).toBe("ValidationError");
  });
});

describe("getRoleById", () => {
  it("returns a plain object", async () => {
    const { getRoleById } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });

    const found = await getRoleById(role._id.toString());

    expect(found).not.toBeInstanceOf(mongoose.Document);
    expect(found.name).toBe(Role.SHOP_STAFF);
  });

  it("rejects an unknown role", async () => {
    const { getRoleById } = await roleService();

    const err = await captureError(
      getRoleById(new mongoose.Types.ObjectId().toString()),
    );

    expect(err.message).toBe(errMsg.ROLE_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });

  it("gap: a malformed id throws a CastError instead of a 404", async () => {
    // `GET /roles/:id` has no `isMongoId()` param validator
    // (routes/role.routes.ts:25), so a CastError — which is neither a
    // CustomError nor one of the shapes the global error handler names —
    // becomes a 500 and a Sentry event for a plainly bad request. Admin-only
    // here, so low severity; reported rather than fixed, because the right
    // place for it is a param validator on the route.
    const { getRoleById } = await roleService();

    const err = await captureError(getRoleById("not-an-object-id"));

    expect(err.name).toBe("CastError");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("getAllRoles", () => {
  it("returns every role to an administrator", async () => {
    const { getAllRoles } = await roleService();
    await seedAllRoles();

    const roles = await getAllRoles(Role.ADMIN);

    expect(roles).toHaveLength(Object.values(Role).length);
    expect(roles[0]).not.toBeInstanceOf(mongoose.Document);
  });

  it("returns every role when no caller role is supplied", async () => {
    // `getRolesHandler` passes `req.user?.role`, which `isAllowed` has always
    // populated with the caller's *current* role name by the time the handler
    // runs — so undefined is not reachable through the route today. Pinned
    // because the fallback is the permissive one: if that ever stopped being
    // true, the narrowing below would silently switch off rather than fail.
    const { getAllRoles } = await roleService();
    await seedAllRoles();

    const roles = await getAllRoles();

    expect(roles).toHaveLength(Object.values(Role).length);
  });

  it("withholds admin, shop_owner and user from a shop owner", async () => {
    // This is the assignable-role list. A shop owner picks from it when
    // hiring, and `registerShopMember` then creates a real, pre-verified user
    // account carrying whatever role id came back — so anything that appears
    // here is a privilege a shop owner can mint. `admin` must never be in it;
    // `shop_owner` and `user` are withheld because neither is a staff role.
    const { getAllRoles } = await roleService();
    await seedAllRoles();

    const roles = await getAllRoles(Role.SHOP_OWNER);

    const names = roles.map((r) => r.name).sort();
    expect(names).toEqual(
      [Role.SHOP_MANAGER, Role.SHOP_STAFF, Role.KITCHEN].sort(),
    );
    expect(names).not.toContain(Role.ADMIN);
  });

  it("does not narrow the list for any other caller role", async () => {
    // Only SHOP_OWNER is narrowed. That is correct as long as the route keeps
    // admitting only ADMIN and SHOP_OWNER (routes/role.routes.ts:22) — this
    // test exists so that widening that `isAllowed` list is a decision someone
    // has to take deliberately rather than a filter that quietly does nothing.
    const { getAllRoles } = await roleService();
    await seedAllRoles();

    const roles = await getAllRoles(Role.SHOP_MANAGER);

    expect(roles).toHaveLength(Object.values(Role).length);
  });

  it("returns an empty list rather than throwing when there are no roles", async () => {
    const { getAllRoles } = await roleService();

    await expect(getAllRoles(Role.SHOP_OWNER)).resolves.toEqual([]);
  });
});

describe("updateRole", () => {
  it("saves both fields a role update may legitimately set", async () => {
    // Both directions of an allowlist need a test, and this is the direction
    // that gets forgotten: an earlier allowlist in this codebase silently
    // stripped legitimate fields from every update while still returning 200,
    // and shipped, because the test only asserted the fields that happened to
    // survive. `name` and `permissions` are the entire editable surface of a
    // role.
    const { updateRole } = await roleService();
    const role = await Roles.create({
      name: Role.SHOP_STAFF,
      permissions: ["orders:read"],
    });

    const updated = await updateRole(role._id.toString(), {
      name: Role.KITCHEN,
      permissions: ["orders:read", "orders:update"],
    });

    expect(updated).toMatchObject({
      name: Role.KITCHEN,
      permissions: ["orders:read", "orders:update"],
    });
    const stored = await Roles.findById(role._id).lean();
    expect(stored).toMatchObject({
      name: Role.KITCHEN,
      permissions: ["orders:read", "orders:update"],
    });
  });

  it("leaves a field the caller did not send alone", async () => {
    const { updateRole } = await roleService();
    const role = await Roles.create({
      name: Role.SHOP_STAFF,
      permissions: ["orders:read"],
    });

    await updateRole(role._id.toString(), { permissions: [] });

    const stored = await Roles.findById(role._id).lean();
    expect(stored!.name).toBe(Role.SHOP_STAFF);
    expect(stored!.permissions).toEqual([]);
  });

  it("regression: ignores an _id in the payload instead of crashing", async () => {
    // Round-tripping a fetched object — GET the role, change the name, PUT the
    // whole thing back — is the obvious way to drive this endpoint, and it
    // sends `_id` along with everything else. Mongoose answers a findByIdAndUpdate
    // carrying `_id` with "Performing an update on the path '_id' would modify
    // the immutable field '_id'", a driver error that is not a CustomError and
    // so lands in the global handler's 500 catch-all. The field is now dropped
    // before the update is built.
    const { updateRole } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });

    const updated = await updateRole(role._id.toString(), {
      _id: new mongoose.Types.ObjectId(),
      name: Role.KITCHEN,
    });

    expect(String(updated._id)).toBe(String(role._id));
    expect(updated.name).toBe(Role.KITCHEN);
  });

  it("returns a plain object", async () => {
    const { updateRole } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });

    const updated = await updateRole(role._id.toString(), {
      name: Role.KITCHEN,
    });

    expect(updated).not.toBeInstanceOf(mongoose.Document);
  });

  it("rejects an unknown role", async () => {
    const { updateRole } = await roleService();

    const err = await captureError(
      updateRole(new mongoose.Types.ObjectId().toString(), {
        name: Role.KITCHEN,
      }),
    );

    expect(err.message).toBe(errMsg.ROLE_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });

  it("hazard: renaming a role silently re-grants everyone who holds it", async () => {
    // Documented current behaviour, not an endorsement, and the reason this
    // endpoint deserves more care than "admin-only" suggests. `isAllowed`
    // decides privilege by reading `role.name` through the user's `role`
    // reference, and `Roles.name` carries no unique index — so renaming the
    // kitchen role to "admin" does not create a new admin account, it promotes
    // every existing kitchen user at once, with nothing in the users
    // collection changing. The obvious-looking action ("fix the label on this
    // role") is the dangerous one.
    //
    // Reported rather than fixed: the guard wants to be a unique index on
    // `Roles.name` plus a migration for any duplicates already in the
    // production database, which is a data change and not a code change.
    const { updateRole } = await roleService();
    const roles = await seedAllRoles();
    const kitchenRole = roles.get(Role.KITCHEN)!;
    const cook = await Users.create({
      firstName: "Line",
      lastName: "Cook",
      email: "cook@example.com",
      password: "hashed",
      phoneNumber: "01000000000",
      role: kitchenRole._id,
    });

    await updateRole(kitchenRole._id.toString(), { name: Role.ADMIN });

    // What `isAllowed` would now resolve for that user.
    const resolved = await Users.findById(cook._id)
      .populate<{ role: { name: string } }>("role", "name")
      .lean();
    expect(resolved!.role.name).toBe(Role.ADMIN);
    expect(await Roles.countDocuments({ name: Role.ADMIN })).toBe(2);
  });
});

describe("deleteRole", () => {
  it("deletes the role and returns it", async () => {
    const { deleteRole } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });

    const deleted = await deleteRole(role._id.toString());

    expect(deleted.name).toBe(Role.SHOP_STAFF);
    expect(await Roles.findById(role._id)).toBeNull();
  });

  it("rejects an unknown role, including one already deleted", async () => {
    const { deleteRole } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });
    await deleteRole(role._id.toString());

    const err = await captureError(deleteRole(role._id.toString()));

    expect(err.message).toBe(errMsg.ROLE_NOT_FOUND.en);
    expect(err.statusCode).toBe(404);
  });

  it("hazard: deleting a role in use locks its holders out with no warning", async () => {
    // Documented current behaviour, not an endorsement. There is no reference
    // check, so the role can be removed while users still point at it. Their
    // `role` reference is left dangling, `isAllowed` populates it to null, and
    // `!currentRole` sends every gated request to 403 — the accounts still log
    // in, they simply cannot do anything, and nothing anywhere says why.
    // Deleting the `user` role is worse still: `signUp` looks it up by name to
    // stamp new accounts, so registration stops for everyone.
    //
    // Reported rather than fixed: refusing the delete needs an error message
    // that does not exist yet in common/err-messages.ts, and the alternative
    // (reassign holders to a fallback role) is a product decision.
    const { deleteRole } = await roleService();
    const staffRole = await Roles.create({ name: Role.SHOP_STAFF });
    const staff = await Users.create({
      firstName: "Some",
      lastName: "Staff",
      email: "staff@example.com",
      password: "hashed",
      phoneNumber: "01000000000",
      role: staffRole._id,
    });

    await deleteRole(staffRole._id.toString());

    const resolved = await Users.findById(staff._id)
      .populate<{ role: { name: string } | null }>("role", "name")
      .lean();
    expect(resolved!.role).toBeNull();
  });
});
