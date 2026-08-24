import { IShop, Shops } from "../models/Shop";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import mongoose, { FilterQuery, ProjectionFields, SortOrder } from "mongoose";
import {
  generateAndUploadMenuQRCode,
  QRCodeOptions,
} from "../utils/qr-code-generator";
import { Users } from "../models/User";
import { Roles } from "../models/Role";
import { hash } from "bcryptjs";
import { SALT_ROUNDS } from "../config/bcrypt";
import { collectionsName } from "../common/collections-name";
import { escapeRegex } from "../utils/escape-regex";
import { isAssignableMemberRole } from "./role.service";

/**
 * Fields shop creation is permitted to set — every field the "create my
 * restaurant" form submits, plus `qrCodeUrl`/`logoUrl`, which
 * `createShopHandler` derives itself (a freshly generated QR code, and an
 * imgbb upload) rather than taking from the request body.
 *
 * This allowlist is the security control, not a tidiness measure, for the
 * same reason `UPDATABLE_SHOP_FIELDS` below is one: the `Pick<IShop, ...>`
 * parameter type is a compile-time constraint only. `createShopHandler`
 * builds the object it actually hands this function as
 * `{ ...req.body, qrCodeUrl, logoUrl }`, and TypeScript's structural typing
 * does nothing to strip properties an incoming JSON body happens to carry
 * beyond the ones the type names — the same gap `pickUpdatableShopFields`
 * closes for updates. `Shop` also declares `subscriptionId` (written only by
 * the Paymob webhook once a real subscription exists — see
 * `payment.webhook.controller.ts`) and `isPaymentDone`, neither of which a
 * shop-creation form should ever set.
 *
 * Traced and confirmed low-impact rather than a privilege escalation:
 * `subscriptionId` is read only for display, via `getUserProfile`'s populate
 * chain — the actual subscription gate
 * (`assertShopHasActiveSubscription` in
 * `subscription-check.middleware.ts`) queries the `Subscriptions` collection
 * by `{ shop: shopId }` and never reads this field, so forging it only risks
 * a misleading "already subscribed" UI redirect, not access to a
 * subscription-gated route. `isPaymentDone` isn't declared on `ShopSchema` at
 * all, so Mongoose's default strict mode already drops it silently. The
 * allowlist closes the gap anyway, so a future feature that starts trusting
 * either field does not inherit a live hole.
 */
const CREATABLE_SHOP_FIELDS = [
  "name",
  "type",
  "address",
  "phoneNumber",
  "email",
  "qrCodeUrl",
  "logoUrl",
] as const satisfies readonly (keyof IShop)[];

function pickCreatableShopFields(shopData: Partial<IShop>): Partial<IShop> {
  const picked: Partial<IShop> = {};
  for (const field of CREATABLE_SHOP_FIELDS) {
    const value = shopData[field];
    if (value !== undefined) {
      // TypeScript cannot correlate the key with its value type while `field`
      // ranges over a union of keys, so it widens the target to `never`. The
      // assignment is sound — the same `field` indexes both objects.
      (picked as Record<string, unknown>)[field] = value;
    }
  }
  return picked;
}

async function createShop(
  shopData: Pick<
    IShop,
    | "name"
    | "type"
    | "address"
    | "phoneNumber"
    | "email"
    | "qrCodeUrl"
    | "logoUrl"
  >,
  currentUserId: string,
) {
  const existingShop = await Shops.findOne({
    ownerId: new mongoose.Types.ObjectId(currentUserId),
  });

  if (existingShop) {
    throw new Errors.BadRequestError(errMsg.USER_ALREADY_HAS_SHOP);
  }

  const shop = await Shops.create({
    ...pickCreatableShopFields(shopData),
    ownerId: new mongoose.Types.ObjectId(currentUserId),
  });

  return shop.toObject();
}

async function getUserShop(userId: string) {
  const shop = await Shops.findOne({
    $or: [
      { ownerId: userId },
      {
        members: {
          $elemMatch: {
            userId: new mongoose.Types.ObjectId(userId),
          },
        },
      },
    ],
  });
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }
  return shop;
}

async function getShop({
  shopName,
  shopId,
}: {
  shopName?: string;
  shopId?: string;
}) {
  if (!shopName && !shopId) {
    // With neither argument the filter below would collapse to `{}` and
    // `.findOne` would hand back an arbitrary shop in full — including
    // `ownerId`, `email`, `phoneNumber` and `members` — to whichever caller
    // forgot to pass a selector. "No selector" must mean "not found", not
    // "any tenant's data", the same family as the order IDOR fixed
    // 2026-07-30. See TECH_DEBT.md.
    throw new Errors.BadRequestError(errMsg.SHOP_SELECTOR_REQUIRED);
  }

  const query: FilterQuery<IShop> = {};
  let select: ProjectionFields<IShop> = {};
  if (shopName) {
    query.name = shopName;
    select = {
      name: 1,
      logoUrl: 1,
      qrCodeUrl: 1,
      type: 1,
      address: 1,
    };
  }
  if (shopId) {
    query._id = shopId;
  }

  const shop = await Shops.findOne(query).select(select);
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }

  return shop;
}

/**
 * Fields a shop update is permitted to touch — mirrors `updateShopValidator`.
 *
 * This allowlist is the security control, not a tidiness measure. The update
 * data is built from `req.body` verbatim, and express-validator checks the
 * fields it names without stripping the ones it doesn't. `ownerId` and
 * `members` are both IShop fields, so spreading the body straight into the
 * update let a caller rewrite them — and `PUT /shops/id/:shopId` admits
 * SHOP_MANAGER as well as the owner, so a manager could reassign the shop to
 * themselves. Because the owner is never in `members` (createShop doesn't add
 * them), moving `ownerId` also stops `getUserShop` resolving for the real
 * owner, whose subscription-gated dashboard then closes entirely.
 *
 * Anything added here must be a field an ordinary shop editor may set — and
 * conversely, this list must cover *every* field the update form legitimately
 * sends, or the write is silently dropped while the request still returns 200.
 * Both halves are pinned by tests: one asserts the escalation is refused, the
 * other asserts an ordinary edit of every UI-supplied field persists.
 *
 * `logoUrl` is safe here even though it is not in `updateShopValidator`,
 * because it is never taken from the request body: `updateShopHandler` spreads
 * it *after* `...req.body`, deriving it from the uploaded file's imgbb URL, and
 * sets it to `undefined` when no file was uploaded — which clobbers any
 * client-supplied value and is then skipped by the copy below, so an edit
 * without a new logo leaves the existing one alone.
 */
const UPDATABLE_SHOP_FIELDS = [
  "name",
  "type",
  "address",
  "phoneNumber",
  "email",
  "logoUrl",
] as const satisfies readonly (keyof IShop)[];

function pickUpdatableShopFields(shopData: Partial<IShop>): Partial<IShop> {
  const updates: Partial<IShop> = {};
  for (const field of UPDATABLE_SHOP_FIELDS) {
    const value = shopData[field];
    if (value !== undefined) {
      // TypeScript cannot correlate the key with its value type while `field`
      // ranges over a union of keys, so it widens the target to `never`. The
      // assignment is sound — the same `field` indexes both objects.
      (updates as Record<string, unknown>)[field] = value;
    }
  }
  return updates;
}

async function updateShop(shopId: string, shopData: Partial<IShop>) {
  const shop = await Shops.findByIdAndUpdate(
    shopId,
    pickUpdatableShopFields(shopData),
    { new: true, runValidators: true },
  );
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }
  return shop;
}

async function deleteShop(shopId: string) {
  const shop = await Shops.findByIdAndDelete(shopId);
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }
  return shop;
}

/**
 * Get all shops with pagination, search, and ordering
 */
async function getAllShops({
  page = 1,
  limit = 10,
  search = "",
  order = "desc",
}: {
  page?: number;
  limit?: number;
  search?: string;
  order?: "asc" | "desc";
} = {}) {
  const skip = (page - 1) * limit;
  const filter: FilterQuery<IShop> = {};
  if (search) {
    // Escaped: `search` is caller-supplied and Mongo compiles $regex as a real
    // pattern on the database server, so an unescaped "(" throws a 500 on a
    // reasonable search and a backtracking pattern burns mongod CPU for every
    // tenant at once. See utils/escape-regex.ts.
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
      { phoneNumber: { $regex: safeSearch, $options: "i" } },
    ];
  }
  const sort: { [key: string]: SortOrder } = {
    createdAt: order === "asc" ? 1 : -1,
  };
  const shops = await Shops.find(filter).sort(sort).skip(skip).limit(limit);
  const total = await Shops.countDocuments(filter);
  return { shops, total };
}

/**
 * Regenerate QR code for shop
 */
async function regenerateShopQRCode(
  shopId: string,
  options: QRCodeOptions = {},
): Promise<{ qrCodeUrl: string; menuUrl: string }> {
  const shop = await Shops.findById(shopId);
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }

  const qrCodeResult = await generateAndUploadMenuQRCode(
    shop.name,
    undefined,
    options,
  );

  // Update shop with new QR code URL
  shop.qrCodeUrl = qrCodeResult.qrCodeUrl;
  await shop.save();

  return qrCodeResult;
}

async function getShopMembers(shopId: string) {
  const shop = await Shops.findById(shopId)
    .populate({
      path: "members.userId",
      model: collectionsName.USERS,
      select: "firstName lastName email phoneNumber",
    })
    .populate({
      path: "members.roleId",
      model: collectionsName.ROLES,
      select: "name",
    })
    .lean();

  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }

  return shop.members;
}

async function removeMemberFromShop(shopId: string, userId: string) {
  const shop = await Shops.findById(shopId);
  if (!shop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);

  // Prevent removing owner
  if (shop.ownerId.toString() === userId) {
    throw new Errors.BadRequestError(errMsg.CANNOT_REMOVE_OWNER);
  }

  const isMember = shop.members.some((m) => m.userId.toString() === userId);
  if (!isMember) {
    throw new Errors.NotFoundError(errMsg.MEMBER_NOT_FOUND);
  }

  // Deleting the user and removing them from the shop's members array must
  // succeed or fail together — otherwise a failure between the two leaves
  // either a deleted user still listed as a member, or a member removed from
  // the roster whose account still exists. Both operations are expressed as
  // idempotent, self-contained writes (rather than mutating the `shop`
  // document fetched above) since withTransaction may retry this callback.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Users.findByIdAndDelete(userId).session(session);
      await Shops.updateOne(
        { _id: shopId },
        { $pull: { members: { userId: new mongoose.Types.ObjectId(userId) } } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  const updatedShop = await Shops.findById(shopId);
  if (!updatedShop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  return updatedShop;
}

async function updateMemberRole(
  shopId: string,
  userId: string,
  roleId: string,
) {
  const shop = await Shops.findById(shopId);
  if (!shop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);

  // Prevent updating owner role
  if (shop.ownerId.toString() === userId) {
    throw new Errors.BadRequestError(errMsg.CANNOT_UPDATE_OWNER_ROLE);
  }

  // Check if role exists AND may be handed out. Existence alone is not
  // authorisation: `roleId` is validated with `isMongoId()` only, so without
  // this a shop owner could promote a member straight to platform `admin`.
  // See NON_ASSIGNABLE_MEMBER_ROLES in role.service.ts.
  const role = await Roles.findById(roleId);
  if (!role) throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  if (!isAssignableMemberRole(role.name)) {
    throw new Errors.UnauthorizedError(errMsg.ROLE_NOT_ASSIGNABLE);
  }

  const member = shop.members.find((m) => m.userId.toString() === userId);
  if (!member) {
    throw new Errors.NotFoundError(errMsg.MEMBER_NOT_FOUND);
  }

  // `shop.members[].roleId` is a label; `Users.role` is what authorisation is
  // actually decided from — `isAllowed` resolves the user's role through it.
  // Writing only the first meant a demotion changed what the dashboard showed
  // and nothing else: "remove this person's manager rights", the action taken
  // when someone is leaving or has done something wrong, silently did nothing.
  //
  // Both writes or neither, and expressed as self-contained idempotent updates
  // rather than mutating the `shop` document fetched above, since
  // withTransaction may retry this callback — same reasoning as
  // removeMemberFromShop.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Shops.updateOne(
        { _id: shopId, "members.userId": new mongoose.Types.ObjectId(userId) },
        { $set: { "members.$.roleId": new mongoose.Types.ObjectId(roleId) } },
        { session },
      );
      await Users.updateOne(
        { _id: userId },
        { $set: { role: new mongoose.Types.ObjectId(roleId) } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  const updatedShop = await Shops.findById(shopId);
  if (!updatedShop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  return updatedShop;
}

async function getShopById(shopId: string) {
  const shop = await Shops.findById(shopId);
  if (!shop) {
    throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);
  }
  return shop;
}

async function registerShopMember(
  shopId: string,
  memberData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber: string;
    roleId: string;
  },
) {
  const shop = await Shops.findById(shopId);
  if (!shop) throw new Errors.NotFoundError(errMsg.SHOP_NOT_FOUND);

  // Check if role exists AND may be handed out — see the note on the same
  // guard in updateMemberRole above. This is the more dangerous of the two
  // sites: the account created below is `isVerified: true` with a password
  // chosen by the caller, so an unguarded admin role here is a ready-to-use
  // administrator login rather than merely an escalated existing user.
  const role = await Roles.findById(memberData.roleId);
  if (!role) throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  if (!isAssignableMemberRole(role.name)) {
    throw new Errors.UnauthorizedError(errMsg.ROLE_NOT_ASSIGNABLE);
  }

  // Hash password
  const hashedPassword = await hash(memberData.password, SALT_ROUNDS);

  // Create the new user
  const newUser = await Users.create({
    firstName: memberData.firstName,
    lastName: memberData.lastName,
    email: memberData.email.toLowerCase(),
    password: hashedPassword,
    phoneNumber: memberData.phoneNumber,
    role: new mongoose.Types.ObjectId(memberData.roleId),
    shop: new mongoose.Types.ObjectId(shopId),
    isVerified: true, // Shop members are automatically verified
  });

  // Add member to shop
  shop.members.push({
    // IUser declares `_id` with mongoose's schema-level `ObjectId` type rather
    // than the runtime `Types.ObjectId` class IShopMember uses, so the two
    // don't line up structurally even though they're the same value.
    userId: new mongoose.Types.ObjectId(newUser._id.toString()),
    roleId: new mongoose.Types.ObjectId(memberData.roleId),
  });
  await shop.save();

  // Return user data without password
  const { _id, firstName, lastName, email, phoneNumber } = newUser.toObject();
  return {
    _id,
    firstName,
    lastName,
    email,
    phoneNumber,
  };
}

/**
 * Every shop's public URL slug plus its last-modified date, for the
 * frontend's dynamically generated sitemap.
 *
 * Deliberately narrow: it returns only the two fields a sitemap entry needs
 * and nothing else. This is an unauthenticated endpoint, so it must not
 * become a way to enumerate owner emails, phone numbers, or addresses — the
 * `.select()` below is the control that prevents that, and it should stay
 * restrictive if this is ever extended.
 *
 * `.lean()` because these are plain data rows, never mutated or saved.
 */
async function getPublicShopList(): Promise<
  { shopName: string; updatedAt: Date }[]
> {
  const shops = await Shops.find({})
    .select({ name: 1, updatedAt: 1, _id: 0 })
    .sort({ updatedAt: -1 })
    .lean();

  return shops.map((shop) => ({
    shopName: shop.name,
    updatedAt: shop.updatedAt,
  }));
}

export {
  createShop,
  getPublicShopList,
  updateShop,
  getAllShops,
  deleteShop,
  getUserShop,
  regenerateShopQRCode,
  removeMemberFromShop,
  updateMemberRole,
  getShopById,
  registerShopMember,
  getShop,
  getShopMembers,
};
