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

  it("throws a CastError for a malformed id, which the route now refuses first", async () => {
    // Documents where the guard lives rather than endorsing this behaviour.
    // Every `/roles/:id` route now carries `roleIdParamValidator`, so a
    // malformed id is a 422 before any handler runs; reaching the service with
    // one is no longer possible through the API. The service itself is left
    // uncast deliberately — moving the check here as well would duplicate it,
    // and the validator is the layer that can name the offending field.
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

  it("regression: refuses to rename a role into a reserved name", async () => {
    // The privilege-escalation half. `isAllowed` decides what a request may do
    // by reading `role.name` through the user's `role` reference, and
    // `Roles.name` carries no unique index — so renaming the kitchen role to
    // "admin" does not create a new admin account, it promotes every existing
    // kitchen user at once, with nothing in the users collection changing.
    // Before the guard this test asserted exactly that, as documented
    // behaviour.
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

    const err = await captureError(
      updateRole(kitchenRole._id.toString(), { name: Role.ADMIN }),
    );

    expect(err.message).toBe(errMsg.ROLE_NAME_RESERVED.en);
    expect(err.statusCode).toBe(400);
    // Nothing was written, so what `isAllowed` resolves for the cook is
    // unchanged — the assertion that matters, since the stored name *is* the
    // privilege.
    const resolved = await Users.findById(cook._id)
      .populate<{ role: { name: string } }>("role", "name")
      .lean();
    expect(resolved!.role.name).toBe(Role.KITCHEN);
    expect(await Roles.countDocuments({ name: Role.ADMIN })).toBe(1);
  });

  it.each([Role.ADMIN, Role.SHOP_OWNER, Role.USER])(
    "regression: refuses to rename the %s role away from its name",
    async (reserved) => {
      // The other direction, and it is not symmetrical hand-wringing: renaming
      // `user` to anything stops `signUp`, which finds that role *by name* to
      // stamp every new account, so registration dies platform-wide. Renaming
      // `admin` or `shop_owner` silently strips the privilege from everyone
      // holding it.
      const { updateRole } = await roleService();
      const roles = await seedAllRoles();

      const err = await captureError(
        updateRole(roles.get(reserved)!._id.toString(), {
          name: Role.KITCHEN,
        }),
      );

      expect(err.message).toBe(errMsg.ROLE_NAME_RESERVED.en);
      expect(await Roles.findOne({ name: reserved }).lean()).not.toBeNull();
    },
  );

  it("still renames freely between non-reserved roles", async () => {
    // The other direction of the guard. A rename that moves no privilege
    // across the reserved boundary is an ordinary edit and must keep working —
    // this codebase has shipped a guard that refused legitimate updates while
    // still returning 200 before.
    const { updateRole } = await roleService();
    const role = await Roles.create({ name: Role.SHOP_STAFF });

    const updated = await updateRole(role._id.toString(), {
      name: Role.KITCHEN,
    });

    expect(updated.name).toBe(Role.KITCHEN);
  });

  it("lets a reserved role be edited as long as its name is unchanged", async () => {
    // Round-tripping a fetched object — GET the role, change `permissions`, PUT
    // the whole thing back — resends the name it already has. Refusing that
    // would make the three reserved roles uneditable, which is a different bug
    // rather than a stricter version of the same guard.
    const { updateRole } = await roleService();
    const role = await Roles.create({ name: Role.ADMIN, permissions: [] });

    const updated = await updateRole(role._id.toString(), {
      name: Role.ADMIN,
      permissions: ["*"],
    });

    expect(updated.permissions).toEqual(["*"]);
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

  it("regression: refuses to delete a role while a user still holds it", async () => {
    // Before the reference check the delete succeeded and left the holder's
    // `role` reference dangling: `isAllowed` populates it to null, `!currentRole`
    // sends every gated request to 403, and the account still logs in perfectly
    // well while being unable to do anything — with nothing anywhere saying why.
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

    const err = await captureError(deleteRole(staffRole._id.toString()));

    expect(err.message).toBe(errMsg.ROLE_IN_USE.en);
    expect(err.statusCode).toBe(400);
    // The role is still there, so the holder still resolves to it.
    const resolved = await Users.findById(staff._id)
      .populate<{ role: { name: string } | null }>("role", "name")
      .lean();
    expect(resolved!.role).not.toBeNull();
    expect(await Roles.findById(staffRole._id).lean()).not.toBeNull();
  });

  it.each([Role.ADMIN, Role.SHOP_OWNER, Role.USER])(
    "regression: refuses to delete the %s role even when nobody holds it",
    async (reserved) => {
      // Emptiness is not safety here: these three names are resolved by string
      // elsewhere in the code, and an unheld `user` role is exactly as fatal to
      // registration as a populated one — `signUp` looks it up by name to stamp
      // every new account.
      const { deleteRole } = await roleService();
      const role = await Roles.create({ name: reserved });

      const err = await captureError(deleteRole(role._id.toString()));

      expect(err.message).toBe(errMsg.ROLE_NAME_RESERVED.en);
      expect(await Roles.findById(role._id).lean()).not.toBeNull();
    },
  );

  it("deletes a role again once its last holder has moved off it", async () => {
    // The other direction. The guard must be a step an administrator can
    // satisfy, not a permanent refusal: reassign the holders, then the delete
    // goes through.
    const { deleteRole } = await roleService();
    const staffRole = await Roles.create({ name: Role.SHOP_STAFF });
    const kitchenRole = await Roles.create({ name: Role.KITCHEN });
    const staff = await Users.create({
      firstName: "Some",
      lastName: "Staff",
      email: "staff@example.com",
      password: "hashed",
      phoneNumber: "01000000000",
      role: staffRole._id,
    });

    await Users.updateOne({ _id: staff._id }, { role: kitchenRole._id });
    const deleted = await deleteRole(staffRole._id.toString());

    expect(deleted.name).toBe(Role.SHOP_STAFF);
    expect(await Roles.findById(staffRole._id)).toBeNull();
  });

  it("counts holders of this role only", async () => {
    // Scoping matters: counting every user, or every user with any role, would
    // make the guard a blanket refusal on any platform with users on it — which
    // would look identical to "delete is broken".
    const { deleteRole } = await roleService();
    const staffRole = await Roles.create({ name: Role.SHOP_STAFF });
    const kitchenRole = await Roles.create({ name: Role.KITCHEN });
    await Users.create({
      firstName: "A",
      lastName: "Cook",
      email: "cook@example.com",
      password: "hashed",
      phoneNumber: "01000000000",
      role: kitchenRole._id,
    });

    await expect(deleteRole(staffRole._id.toString())).resolves.toMatchObject({
      name: Role.SHOP_STAFF,
    });
  });
});
