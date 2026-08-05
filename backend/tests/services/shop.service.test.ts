import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import type { Types } from "mongoose";
import { compare } from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Shops } from "../../models/Shop";
import type { IShop } from "../../models/Shop";
import { Users } from "../../models/User";
import { Roles, Role } from "../../models/Role";
import { clearTestDB } from "../db-test-helper";

/**
 * Service-level coverage for the shop service: shop creation and lookup, the
 * member roster, and QR-code regeneration.
 *
 * The roster half is the sharp end. `removeMemberFromShop` does not merely
 * un-list somebody — it *deletes their user account*, and `registerShopMember`
 * creates one, hashes its password and grants it a role. Both are addressed by
 * a `(shopId, userId)` pair lifted straight out of the URL, so "is this person
 * actually in this shop" is the only check standing between one shop owner and
 * another shop's staff accounts. Every cross-tenant test below therefore
 * asserts what survived, not just that the call threw.
 *
 * The other half is disclosure. `getShop` by name and `getPublicShopList` are
 * both unauthenticated, and each relies on a `.select()` projection to keep
 * owner emails, phone numbers, addresses and member ids out of a public
 * response — a control that no feature would break if it were deleted.
 *
 * Deliberately NOT mocked: bcrypt and Mongo, so hashing and persistence are
 * the real thing. Only the QR-code/imgbb boundary is stubbed.
 */

// The real helper renders a PNG and uploads it to imgbb over the network on a
// paid API key. Stubbing it is what makes "no upload happens for a shop that
// does not exist" an assertion worth writing rather than a description of a
// mock.
const generateQRCodeMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/qr-code-generator", () => ({
  generateAndUploadMenuQRCode: generateQRCodeMock,
}));

/**
 * `removeMemberFromShop` wraps its two writes in `session.withTransaction`,
 * and mongod only offers transactions on a replica set. The shared
 * `connectTestDB()` helper starts a standalone server, where that call fails
 * with "Transaction numbers are only allowed on a replica set member or
 * mongos" — so the one operation in this service that destroys a user account
 * would be the one operation left untested. A single-node replica set is the
 * smallest thing that runs it for real. `clearTestDB()` works off the
 * connection, so it is reused unchanged.
 */
let replSet: MongoMemoryReplSet | null = null;

const shopService = () => import("../../services/shop.service");

const OWNER_A = new mongoose.Types.ObjectId();
const OWNER_B = new mongoose.Types.ObjectId();

// IUser declares `_id` with mongoose's schema-level `ObjectId` type rather
// than the runtime `Types.ObjectId` class IShopMember uses, so the two don't
// line up structurally even though they are the same value — the same wrinkle
// shop.service.ts:299 works around.
const oid = (v: unknown): Types.ObjectId =>
  new mongoose.Types.ObjectId(String(v));

type CapturedError = Error & { statusCode?: number; code?: number };

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

// `name` carries a unique index, and the index outlives clearTestDB().
let shopNameSeq = 0;
const nextShopName = () => `Test Bistro ${++shopNameSeq}`;

let staffRoleId: Types.ObjectId;
let managerRoleId: Types.ObjectId;

function shopInput(overrides: Record<string, unknown> = {}) {
  return {
    name: nextShopName(),
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: "owner@example.com",
    ...overrides,
  } as unknown as Parameters<
    Awaited<ReturnType<typeof shopService>>["createShop"]
  >[0];
}

async function seedShop(
  overrides: {
    name?: string;
    email?: string;
    phoneNumber?: string;
    ownerId?: Types.ObjectId;
    members?: { userId: Types.ObjectId; roleId: Types.ObjectId }[];
    createdAt?: Date;
    updatedAt?: Date;
  } = {},
) {
  const { createdAt, updatedAt, ...rest } = overrides;
  const shop = await Shops.create({
    name: nextShopName(),
    type: "restaurant",
    address: { country: "EG", city: "Cairo", street: "1 Main St" },
    phoneNumber: "01000000000",
    email: "owner@example.com",
    ownerId: OWNER_A,
    ...rest,
  });

  if (createdAt || updatedAt) {
    // timestamps:false so the plugin doesn't stomp the values straight back.
    await Shops.findByIdAndUpdate(
      shop._id,
      { ...(createdAt && { createdAt }), ...(updatedAt && { updatedAt }) },
      { timestamps: false },
    );
  }

  return shop;
}

let userEmailSeq = 0;
async function seedUser(roleId: Types.ObjectId = staffRoleId) {
  return Users.create({
    firstName: "Staff",
    lastName: "Member",
    email: `staff${++userEmailSeq}@example.com`,
    password: "already-hashed",
    phoneNumber: "01000000000",
    role: roleId,
    isVerified: true,
  });
}

function memberData(roleId: Types.ObjectId, email = "new.member@example.com") {
  return {
    firstName: "New",
    lastName: "Member",
    email,
    password: "StaffPass123!",
    phoneNumber: "01000000001",
    roleId: roleId.toString(),
  };
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  // Build the unique indexes up front. Mongoose builds them in the background,
  // so without this the duplicate-name and duplicate-email tests can race the
  // build and pass for the wrong reason (or fail intermittently).
  await Shops.init();
  await Users.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

beforeEach(async () => {
  await clearTestDB();
  vi.clearAllMocks();
  generateQRCodeMock.mockResolvedValue({
    qrCodeUrl: "https://i.ibb.co/qr.png",
    menuUrl: "http://localhost:5173/shops/Test%20Bistro/menu",
  });
  const [staff, manager] = await Roles.create([
    { name: Role.SHOP_STAFF, permissions: [] },
    { name: Role.SHOP_MANAGER, permissions: [] },
  ]);
  staffRoleId = staff._id;
  managerRoleId = manager._id;
});

describe("createShop", () => {
  it("records the caller as owner and ignores an ownerId in the payload", async () => {
    const { createShop } = await shopService();

    const created = await createShop(
      shopInput({ ownerId: OWNER_B }),
      OWNER_A.toString(),
    );

    // Ownership decides everything downstream — `isShopOwner`, member
    // management, subscription cancellation — and it must come from the
    // authenticated token, never from the request body the controller spreads
    // into this payload.
    const stored = await Shops.findById(created._id).lean();
    expect(stored?.ownerId.toString()).toBe(OWNER_A.toString());
  });

  it("refuses a second shop for the same owner", async () => {
    const { createShop } = await shopService();
    await createShop(shopInput(), OWNER_A.toString());

    await expect(createShop(shopInput(), OWNER_A.toString())).rejects.toThrow(
      "User already has a shop",
    );

    // One owner, one shop is the tenancy assumption the whole app rests on:
    // the access token carries a single `shopId`, so a second shop would be
    // permanently unreachable by its own owner.
    expect(await Shops.countDocuments({})).toBe(1);
  });

  it("still lets a different user create their own shop", async () => {
    const { createShop } = await shopService();
    await createShop(shopInput(), OWNER_A.toString());

    await expect(
      createShop(shopInput(), OWNER_B.toString()),
    ).resolves.toMatchObject({ ownerId: OWNER_B });
  });

  it("rejects a shop name that is already taken", async () => {
    const { createShop } = await shopService();
    const name = nextShopName();
    await createShop(shopInput({ name }), OWNER_A.toString());

    const err = await captureError(
      createShop(shopInput({ name }), OWNER_B.toString()),
    );

    // Enforced by the unique index rather than an explicit check. The name is
    // the public URL slug — `/shops/:shopName/menu`, and the lookup key for
    // both `getShop` and the public menu listing — so two shops sharing one
    // would serve one shop's customers the other's menu.
    expect(err.code).toBe(11000);
    expect(await Shops.countDocuments({})).toBe(1);
  });

  it("stores the address and the QR code URL it was handed", async () => {
    const { createShop } = await shopService();

    const created = await createShop(
      shopInput({ qrCodeUrl: "https://i.ibb.co/qr.png" }),
      OWNER_A.toString(),
    );

    expect(created.address).toMatchObject({ city: "Cairo" });
    expect(created.qrCodeUrl).toBe("https://i.ibb.co/qr.png");
    expect(created.subscriptionId).toBeNull();
  });
});

describe("getUserShop", () => {
  it("resolves the shop a user owns", async () => {
    const { getUserShop } = await shopService();
    const shop = await seedShop({ ownerId: OWNER_A });

    const found = await getUserShop(OWNER_A.toString());

    expect(found._id.toString()).toBe(shop._id.toString());
  });

  it("resolves the shop a user is only a member of", async () => {
    const { getUserShop } = await shopService();
    const staff = await seedUser();
    await seedShop({ ownerId: OWNER_A });
    const employer = await seedShop({
      ownerId: OWNER_B,
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    const found = await getUserShop(staff._id.toString());

    // A shop the user has no relationship with exists first in the collection,
    // so this also proves the query discriminates rather than returning
    // whatever `findOne` reaches first.
    expect(found._id.toString()).toBe(employer._id.toString());
  });

  it("throws for a user attached to no shop at all", async () => {
    const { getUserShop } = await shopService();
    await seedShop({ ownerId: OWNER_A });

    // This is what `checkActiveSubscrtion` calls first, so a false positive
    // here would hand an unrelated user another shop's subscription state and
    // every route gated behind it.
    await expect(
      getUserShop(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow("Shop not found");
  });
});

describe("getShop", () => {
  it("returns only public fields when looked up by name", async () => {
    const { getShop } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      email: "private@example.com",
      phoneNumber: "01099999999",
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    const found = await getShop({ shopName: shop.name });

    // `/shops/name/:shopName` is unauthenticated — anyone who scans a QR code
    // hits it. The projection is the only thing keeping the owner's email and
    // phone number, and the shop's staff roster, out of that response.
    expect(found.name).toBe(shop.name);
    expect(found.type).toBe("restaurant");
    expect(found.email).toBeUndefined();
    expect(found.phoneNumber).toBeUndefined();
    expect(found.ownerId).toBeUndefined();
    expect(found.members).toBeUndefined();
  });

  it("returns the whole document when looked up by id", async () => {
    const { getShop } = await shopService();
    const shop = await seedShop({ email: "private@example.com" });

    const found = await getShop({ shopId: shop._id.toString() });

    // The by-id route is behind `protect` + `isShopMember`, so the caller is
    // already established as part of this shop and the private fields are
    // theirs to see.
    expect(found.email).toBe("private@example.com");
    expect(found.ownerId.toString()).toBe(OWNER_A.toString());
  });

  it("throws for a name that matches no shop", async () => {
    const { getShop } = await shopService();

    await expect(getShop({ shopName: "No Such Shop" })).rejects.toThrow(
      "Shop not found",
    );
  });

  it("returns an arbitrary shop, in full, when given neither a name nor an id", async () => {
    const { getShop } = await shopService();
    await seedShop({ email: "private@example.com" });

    const found = await getShop({});

    // CURRENT BEHAVIOUR, not desired behaviour: with both arguments absent the
    // filter is `{}` and the projection is `{}`, so this hands back the first
    // shop in the collection with every private field attached. Unreachable
    // today because each of the two routes supplies exactly one of the pair
    // from its own path. "No selector" should mean "not found", not "any
    // shop". Reported; do not "fix" by changing this assertion.
    expect(found.email).toBe("private@example.com");
  });
});

describe("getShopById", () => {
  it("returns the shop", async () => {
    const { getShopById } = await shopService();
    const shop = await seedShop();

    const found = await getShopById(shop._id.toString());

    expect(found._id.toString()).toBe(shop._id.toString());
  });

  it("throws for an id that matches no shop", async () => {
    const { getShopById } = await shopService();

    await expect(
      getShopById(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow("Shop not found");
  });
});

describe("updateShop", () => {
  it("applies the change and returns the updated document", async () => {
    const { updateShop } = await shopService();
    const shop = await seedShop();

    const updated = await updateShop(shop._id.toString(), {
      phoneNumber: "01055555555",
      address: { country: "EG", city: "Giza", street: "9 Nile St" },
    });

    // `{ new: true }` is what the dashboard re-renders after a save; the
    // pre-update copy would read as "the change didn't take".
    expect(updated.phoneNumber).toBe("01055555555");
    expect(updated.address.city).toBe("Giza");
    expect((await Shops.findById(shop._id).lean())?.address.city).toBe("Giza");
  });

  /**
   * REGRESSION (2026-08-05): the allowlist that closed the mass-assignment
   * hole below was written from `updateShopValidator`, which does not name
   * `type` — and `logoUrl` never appears in a validator at all, because
   * `updateShopHandler` derives it from the uploaded file rather than the body.
   * Both were therefore stripped from every update while the request still
   * returned 200 with a success message, so a shop owner changing their logo
   * saw a success toast and no change.
   *
   * The test above kept passing because it happened to assert only
   * `phoneNumber` and `address`. An allowlist needs its permissive direction
   * tested as deliberately as its restrictive one: this asserts every field
   * `useRestaurantForm.ts` actually submits, so adding a field to the form
   * without adding it to the allowlist fails here instead of in production.
   */
  it("persists every field the shop edit form submits", async () => {
    const { updateShop } = await shopService();
    const shop = await seedShop();

    const updated = await updateShop(shop._id.toString(), {
      name: "Renamed Bistro",
      type: "cafe",
      email: "new@example.com",
      phoneNumber: "01055555555",
      address: { country: "EG", city: "Giza", street: "9 Nile St" },
      // Set server-side by the handler from the imgbb upload, not by the body.
      logoUrl: "https://i.ibb.co/new-logo.png",
    });

    expect(updated.name).toBe("Renamed Bistro");
    expect(updated.type).toBe("cafe");
    expect(updated.email).toBe("new@example.com");
    expect(updated.phoneNumber).toBe("01055555555");
    expect(updated.address.city).toBe("Giza");
    expect(updated.logoUrl).toBe("https://i.ibb.co/new-logo.png");

    // Read back from the database rather than trusting the returned document:
    // the bug being pinned was a dropped *write* that still returned a
    // plausible-looking response.
    const stored = await Shops.findById(shop._id).lean();
    expect(stored?.type).toBe("cafe");
    expect(stored?.logoUrl).toBe("https://i.ibb.co/new-logo.png");
  });

  it("leaves the existing logo alone when an edit uploads no new one", async () => {
    const { updateShop } = await shopService();
    const shop = await seedShop();
    await updateShop(shop._id.toString(), {
      logoUrl: "https://i.ibb.co/original.png",
    });

    // The handler sends `logoUrl: undefined` whenever no file was uploaded, so
    // an ordinary text-only edit must not wipe the logo the shop already has.
    const updated = await updateShop(shop._id.toString(), {
      name: "Text Only Edit",
      logoUrl: undefined,
    });

    expect(updated.logoUrl).toBe("https://i.ibb.co/original.png");
  });

  it("throws for a shop that does not exist", async () => {
    const { updateShop } = await shopService();

    await expect(
      updateShop(new mongoose.Types.ObjectId().toString(), { type: "cafe" }),
    ).rejects.toThrow("Shop not found");
  });

  /**
   * DEFECT MARKER — flips to passing when the source is fixed; do not delete.
   *
   * `shopData` is `Partial<IShop>`, and updateShopHandler builds it by
   * spreading `req.body` verbatim into `findByIdAndUpdate`. `ownerId` and
   * `members` are fields of IShop, neither is named by `updateShopValidator`,
   * and express-validator does not strip keys it was not told about — so
   * `PUT /shops/id/:shopId` with `{"ownerId": "<anyone>"}` rewrites who owns
   * the shop. The route admits SHOP_MANAGER as well as SHOP_OWNER, so a
   * manager can do it to their own employer: the real owner is not in
   * `members` (createShop never adds them), so once `ownerId` moves,
   * `getUserShop` stops resolving for them, `checkActiveSubscrtion` throws,
   * and every subscription-gated route in the dashboard closes.
   *
   * Fix shape: whitelist the updatable fields in the service rather than
   * trusting a validator that only inspects the fields it happens to name.
   */
  it("does not let the update body hand the shop to a different owner", async () => {
    const { updateShop } = await shopService();
    const shop = await seedShop({ ownerId: OWNER_A });

    await updateShop(shop._id.toString(), {
      ownerId: OWNER_B,
    } as Partial<IShop>);

    const stored = await Shops.findById(shop._id).lean();
    expect(stored?.ownerId.toString()).toBe(OWNER_A.toString());
  });
});

describe("deleteShop", () => {
  it("deletes the shop and hands back what it removed", async () => {
    const { deleteShop } = await shopService();
    const shop = await seedShop();

    const deleted = await deleteShop(shop._id.toString());

    expect(deleted._id.toString()).toBe(shop._id.toString());
    expect(await Shops.countDocuments({})).toBe(0);
  });

  it("throws for a shop that does not exist", async () => {
    const { deleteShop } = await shopService();

    await expect(
      deleteShop(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow("Shop not found");
  });
});

describe("getAllShops", () => {
  it("paginates while reporting the unpaginated total", async () => {
    const { getAllShops } = await shopService();
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 5; i++) {
      await seedShop({
        ownerId: new mongoose.Types.ObjectId(),
        createdAt: new Date(base + i * 60_000),
      });
    }

    const page1 = await getAllShops({ page: 1, limit: 2 });
    const page3 = await getAllShops({ page: 3, limit: 2 });

    expect(page1.shops).toHaveLength(2);
    expect(page3.shops).toHaveLength(1);
    // `total` drives the admin table's page count, so it must ignore the page
    // window or the UI offers pages that return nothing.
    expect(page1.total).toBe(5);
    expect(page3.total).toBe(5);

    const ids = new Set([
      ...page1.shops.map((s) => s._id.toString()),
      ...page3.shops.map((s) => s._id.toString()),
    ]);
    expect(ids.size).toBe(3);
  });

  it("orders newest first by default and oldest first on request", async () => {
    const { getAllShops } = await shopService();
    const base = Date.UTC(2026, 0, 1);
    const older = await seedShop({
      ownerId: new mongoose.Types.ObjectId(),
      createdAt: new Date(base),
    });
    const newer = await seedShop({
      ownerId: new mongoose.Types.ObjectId(),
      createdAt: new Date(base + 60_000),
    });

    const desc = await getAllShops();
    const asc = await getAllShops({ order: "asc" });

    expect(desc.shops.map((s) => s._id.toString())).toEqual([
      newer._id.toString(),
      older._id.toString(),
    ]);
    expect(asc.shops.map((s) => s._id.toString())).toEqual([
      older._id.toString(),
      newer._id.toString(),
    ]);
  });

  it("searches name, email and phone number case-insensitively", async () => {
    const { getAllShops } = await shopService();
    const target = await seedShop({
      name: "Falafel Palace",
      email: "hello@falafel.example",
      phoneNumber: "01234567890",
      ownerId: new mongoose.Types.ObjectId(),
    });
    await seedShop({ ownerId: new mongoose.Types.ObjectId() });

    for (const term of ["falafel palace", "HELLO@FALAFEL", "0123456"]) {
      const { shops, total } = await getAllShops({ search: term });
      expect(total).toBe(1);
      expect(shops[0]._id.toString()).toBe(target._id.toString());
    }
  });

  it("treats the search term as a regular expression rather than literal text", async () => {
    const { getAllShops } = await shopService();
    await seedShop({ name: "Falafel Palace", ownerId: OWNER_A });
    await seedShop({ name: "Koshary House", ownerId: OWNER_B });

    const { total } = await getAllShops({ search: "." });

    // CURRENT BEHAVIOUR, not desired behaviour: `search` is interpolated
    // straight into `$regex` unescaped, so a metacharacter changes the query's
    // meaning — "." matches every shop — and an unbalanced "(" makes Mongo
    // reject the query outright, surfacing as a 500. Admin-only today, which
    // caps the impact, but the fix is one `escapeRegExp` call. Reported; do
    // not "fix" by changing this assertion.
    expect(total).toBe(2);
  });
});

describe("regenerateShopQRCode", () => {
  it("stores the freshly uploaded URL on the shop", async () => {
    const { regenerateShopQRCode } = await shopService();
    const shop = await seedShop();
    generateQRCodeMock.mockResolvedValue({
      qrCodeUrl: "https://i.ibb.co/new-qr.png",
      menuUrl: `http://localhost:5173/shops/${shop.name}/menu`,
    });

    const result = await regenerateShopQRCode(shop._id.toString());

    // The stored URL is what the owner prints onto table cards; returning the
    // new one without persisting it would give them a code the shop record
    // does not know about.
    expect(result.qrCodeUrl).toBe("https://i.ibb.co/new-qr.png");
    expect((await Shops.findById(shop._id).lean())?.qrCodeUrl).toBe(
      "https://i.ibb.co/new-qr.png",
    );
    expect(generateQRCodeMock).toHaveBeenCalledWith(
      shop.name,
      undefined,
      expect.any(Object),
    );
  });

  it("does not generate or upload anything for a shop that does not exist", async () => {
    const { regenerateShopQRCode } = await shopService();

    await expect(
      regenerateShopQRCode(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow("Shop not found");

    // Ordering matters twice over: the upload is a paid third-party call, and
    // the caller must be told the shop is missing rather than that an image
    // upload failed.
    expect(generateQRCodeMock).not.toHaveBeenCalled();
  });
});

describe("getShopMembers", () => {
  it("returns this shop's roster with each member's user and role expanded", async () => {
    const { getShopMembers } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });
    const other = await seedUser();
    await seedShop({
      ownerId: OWNER_B,
      members: [{ userId: oid(other._id), roleId: managerRoleId }],
    });

    const members = await getShopMembers(shop._id.toString());

    // The roster is a per-shop list; a second shop's members existing in the
    // same collection must not bleed into it.
    expect(members).toHaveLength(1);
    const [member] = members as unknown as [
      { userId: { email: string }; roleId: { name: string } },
    ];
    expect(member.userId.email).toBe(staff.email);
    expect(member.roleId.name).toBe(Role.SHOP_STAFF);
  });

  it("never exposes a member's password hash", async () => {
    const { getShopMembers } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    const members = await getShopMembers(shop._id.toString());

    // `select: false` on the schema already hides it, and the populate's own
    // `select` narrows it further. Both are belt and braces for the same
    // thing: this response is rendered in the owner's dashboard, and a leaked
    // hash there is an offline cracking target for every staff account.
    const [member] = members as unknown as [
      { userId: Record<string, unknown> },
    ];
    expect(member.userId).not.toHaveProperty("password");
    expect(member.userId).not.toHaveProperty("refreshToken");
  });

  it("throws for a shop that does not exist", async () => {
    const { getShopMembers } = await shopService();

    await expect(
      getShopMembers(new mongoose.Types.ObjectId().toString()),
    ).rejects.toThrow("Shop not found");
  });
});

describe("registerShopMember", () => {
  it("creates a verified, hashed, shop-linked account and adds it to the roster", async () => {
    const { registerShopMember } = await shopService();
    const shop = await seedShop();

    await registerShopMember(shop._id.toString(), memberData(staffRoleId));

    const created = await Users.findOne({ email: "new.member@example.com" })
      .select("+password")
      .lean();
    // Three separate guarantees, each of which fails silently on its own: a
    // plaintext password nobody notices until a breach, an account that cannot
    // log in because it was never verified (staff have no inbox flow here),
    // and a user whose `shop` link is missing — which is what puts `shopId`
    // into their access token and therefore scopes every request they make.
    expect(created?.password).not.toBe("StaffPass123!");
    await expect(compare("StaffPass123!", created!.password)).resolves.toBe(
      true,
    );
    expect(created?.isVerified).toBe(true);
    expect(created?.shop?.toString()).toBe(shop._id.toString());
    expect(created?.role?.toString()).toBe(staffRoleId.toString());

    const stored = await Shops.findById(shop._id).lean();
    expect(stored?.members).toHaveLength(1);
    expect(stored?.members[0].userId.toString()).toBe(created!._id.toString());
  });

  it("returns no credentials or internal fields to the caller", async () => {
    const { registerShopMember } = await shopService();
    const shop = await seedShop();

    const result = await registerShopMember(
      shop._id.toString(),
      memberData(staffRoleId),
    );

    // The response is echoed back to the owner's browser, so this is the
    // assertion standing between the freshly minted hash and the wire.
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("refreshToken");
    expect(result).not.toHaveProperty("verificationCode");
    expect(result).toMatchObject({ email: "new.member@example.com" });
  });

  it("lower-cases the email so the member can sign in with any casing", async () => {
    const { registerShopMember } = await shopService();
    const shop = await seedShop();

    await registerShopMember(
      shop._id.toString(),
      memberData(staffRoleId, "Mixed.Case@Example.COM"),
    );

    // Every lookup in auth.service lower-cases before querying, so an address
    // stored with capitals would make the account permanently unreachable.
    await expect(
      Users.countDocuments({ email: "mixed.case@example.com" }),
    ).resolves.toBe(1);
  });

  it("creates no account when the shop does not exist", async () => {
    const { registerShopMember } = await shopService();

    await expect(
      registerShopMember(
        new mongoose.Types.ObjectId().toString(),
        memberData(staffRoleId),
      ),
    ).rejects.toThrow("Shop not found");

    // An orphaned account with a `shop` pointing nowhere could still log in.
    expect(await Users.countDocuments({})).toBe(0);
  });

  it("creates no account when the role does not exist", async () => {
    const { registerShopMember } = await shopService();
    const shop = await seedShop();

    await expect(
      registerShopMember(
        shop._id.toString(),
        memberData(new mongoose.Types.ObjectId()),
      ),
    ).rejects.toThrow("Role not found");

    // Guard ordering is the point: the role is checked *before* the user is
    // created, so a bad roleId cannot leave a half-provisioned account behind
    // whose `role` reference resolves to nothing on every token issue.
    expect(await Users.countDocuments({})).toBe(0);
  });

  it("rejects a duplicate email with a raw index error and leaves the roster intact", async () => {
    const { registerShopMember } = await shopService();
    const shop = await seedShop();
    await registerShopMember(shop._id.toString(), memberData(staffRoleId));

    const err = await captureError(
      registerShopMember(shop._id.toString(), memberData(managerRoleId)),
    );

    // CURRENT BEHAVIOUR, not desired behaviour: nothing checks for an existing
    // account first, so this surfaces as a MongoServerError (code 11000) and a
    // 500 rather than the MEMBER_ALREADY_EXISTS / EMAIL_ALREADY_IN_USE message
    // that already exists in err-messages.ts and is used nowhere. What matters
    // more is what it does *not* do: the failure lands on the user insert,
    // before `shop.save()`, so the roster is untouched. Reported; do not "fix"
    // by changing this assertion.
    expect(err.code).toBe(11000);
    expect((await Shops.findById(shop._id).lean())?.members).toHaveLength(1);
  });
});

describe("removeMemberFromShop", () => {
  it("deletes the member's account and drops them from the roster together", async () => {
    const { removeMemberFromShop } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    const updated = await removeMemberFromShop(
      shop._id.toString(),
      staff._id.toString(),
    );

    // The two writes are wrapped in a transaction precisely so neither half
    // can land alone: a deleted user still on the roster renders as a blank
    // row the owner cannot remove, and a removed row whose account survives
    // leaves an ex-employee holding working credentials.
    expect(updated.members).toHaveLength(0);
    expect(await Users.findById(staff._id)).toBeNull();
  });

  it("refuses to remove the owner, and does not delete their account", async () => {
    const { removeMemberFromShop } = await shopService();
    const owner = await seedUser();
    const shop = await seedShop({ ownerId: oid(owner._id) });

    await expect(
      removeMemberFromShop(shop._id.toString(), owner._id.toString()),
    ).rejects.toThrow("Cannot remove the shop owner");

    // Without this guard the owner-management endpoint would be a way for an
    // owner to delete their own account while leaving the shop, its menu and
    // its orders behind with no one able to reach them.
    expect(await Users.findById(owner._id)).not.toBeNull();
  });

  it("cannot delete a user who belongs to a different shop", async () => {
    const { removeMemberFromShop } = await shopService();
    const staff = await seedUser();
    const mine = await seedShop({ ownerId: OWNER_A });
    const theirs = await seedShop({
      ownerId: OWNER_B,
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    await expect(
      removeMemberFromShop(mine._id.toString(), staff._id.toString()),
    ).rejects.toThrow("Member not found in this shop");

    // The whole reason this service needs a membership check at all: both ids
    // come from the URL (`DELETE /shops/:shopId/members/:userId`), and the
    // effect is an irreversible account deletion. `isShopOwner` pins the
    // shopId to the caller, so this check is what pins the userId to the shop.
    expect(await Users.findById(staff._id)).not.toBeNull();
    expect((await Shops.findById(theirs._id).lean())?.members).toHaveLength(1);
  });

  it("throws for a user who is a member of no shop", async () => {
    const { removeMemberFromShop } = await shopService();
    const stranger = await seedUser();
    const shop = await seedShop();

    await expect(
      removeMemberFromShop(shop._id.toString(), stranger._id.toString()),
    ).rejects.toThrow("Member not found in this shop");

    expect(await Users.findById(stranger._id)).not.toBeNull();
  });

  it("throws for a shop that does not exist", async () => {
    const { removeMemberFromShop } = await shopService();
    const staff = await seedUser();

    await expect(
      removeMemberFromShop(
        new mongoose.Types.ObjectId().toString(),
        staff._id.toString(),
      ),
    ).rejects.toThrow("Shop not found");

    expect(await Users.findById(staff._id)).not.toBeNull();
  });
});

describe("updateMemberRole", () => {
  it("changes the member's role on the roster", async () => {
    const { updateMemberRole } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    await updateMemberRole(
      shop._id.toString(),
      staff._id.toString(),
      managerRoleId.toString(),
    );

    const stored = await Shops.findById(shop._id).lean();
    expect(stored?.members[0].roleId.toString()).toBe(managerRoleId.toString());
  });

  it("leaves the member's own role field untouched, so their permissions do not move", async () => {
    const { updateMemberRole } = await shopService();
    const staff = await seedUser(staffRoleId);
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    await updateMemberRole(
      shop._id.toString(),
      staff._id.toString(),
      managerRoleId.toString(),
    );

    // CURRENT BEHAVIOUR, not desired behaviour: authorisation is decided by
    // `isAllowed`, which reads the `role` claim in the access token, and that
    // claim is signed from `Users.role` — never from `shop.members[].roleId`.
    // So this endpoint moves only the label shown in the members table: a
    // promoted staff member gains nothing, and, worse, a manager demoted for
    // cause keeps every manager permission. The two fields are written
    // together by registerShopMember and then allowed to drift. Reported; do
    // not "fix" by changing this assertion.
    const stored = await Users.findById(staff._id).lean();
    expect(stored?.role?.toString()).toBe(staffRoleId.toString());
  });

  it("refuses to change the owner's role", async () => {
    const { updateMemberRole } = await shopService();
    const owner = await seedUser();
    const shop = await seedShop({ ownerId: oid(owner._id) });

    await expect(
      updateMemberRole(
        shop._id.toString(),
        owner._id.toString(),
        staffRoleId.toString(),
      ),
    ).rejects.toThrow("Cannot update owner role");
  });

  it("rejects a role that does not exist, leaving the roster unchanged", async () => {
    const { updateMemberRole } = await shopService();
    const staff = await seedUser();
    const shop = await seedShop({
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    await expect(
      updateMemberRole(
        shop._id.toString(),
        staff._id.toString(),
        new mongoose.Types.ObjectId().toString(),
      ),
    ).rejects.toThrow("Role not found");

    // A dangling roleId would break `getShopMembers`' populate and render the
    // member with no role at all.
    const stored = await Shops.findById(shop._id).lean();
    expect(stored?.members[0].roleId.toString()).toBe(staffRoleId.toString());
  });

  it("cannot re-role a member of a different shop", async () => {
    const { updateMemberRole } = await shopService();
    const staff = await seedUser();
    const mine = await seedShop({ ownerId: OWNER_A });
    const theirs = await seedShop({
      ownerId: OWNER_B,
      members: [{ userId: oid(staff._id), roleId: staffRoleId }],
    });

    await expect(
      updateMemberRole(
        mine._id.toString(),
        staff._id.toString(),
        managerRoleId.toString(),
      ),
    ).rejects.toThrow("Member not found in this shop");

    const stored = await Shops.findById(theirs._id).lean();
    expect(stored?.members[0].roleId.toString()).toBe(staffRoleId.toString());
  });

  it("throws for a shop that does not exist", async () => {
    const { updateMemberRole } = await shopService();

    await expect(
      updateMemberRole(
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId().toString(),
        staffRoleId.toString(),
      ),
    ).rejects.toThrow("Shop not found");
  });
});

describe("getPublicShopList", () => {
  it("returns only the slug and last-modified date of every shop", async () => {
    const { getPublicShopList } = await shopService();
    const shop = await seedShop({
      email: "private@example.com",
      phoneNumber: "01099999999",
    });

    const list = await getPublicShopList();

    // This feeds the frontend's generated sitemap over an unauthenticated
    // endpoint. The `.select()` in the service is the control: without it the
    // route becomes a bulk export of every owner's email, phone number and
    // street address, which is exactly the shape of a scraped lead list.
    expect(list).toEqual([
      { shopName: shop.name, updatedAt: expect.any(Date) },
    ]);
  });

  it("puts the most recently updated shop first", async () => {
    const { getPublicShopList } = await shopService();
    const base = Date.UTC(2026, 0, 1);
    const stale = await seedShop({
      ownerId: new mongoose.Types.ObjectId(),
      updatedAt: new Date(base),
    });
    const fresh = await seedShop({
      ownerId: new mongoose.Types.ObjectId(),
      updatedAt: new Date(base + 60_000),
    });

    const list = await getPublicShopList();

    // `updatedAt` becomes each entry's `<lastmod>`, so the ordering is what
    // tells a crawler which pages are worth re-fetching first.
    expect(list.map((s) => s.shopName)).toEqual([fresh.name, stale.name]);
  });

  it("returns an empty list rather than throwing when there are no shops", async () => {
    const { getPublicShopList } = await shopService();

    // The sitemap route must still render on a fresh deployment.
    await expect(getPublicShopList()).resolves.toEqual([]);
  });
});
