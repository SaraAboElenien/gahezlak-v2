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
    ...shopData,
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

async function updateShop(shopId: string, shopData: Partial<IShop>) {
  const shop = await Shops.findByIdAndUpdate(shopId, shopData, { new: true });
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
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
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

  // Check if role exists
  const role = await Roles.findById(roleId);
  if (!role) throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);

  const member = shop.members.find((m) => m.userId.toString() === userId);
  if (!member) {
    throw new Errors.NotFoundError(errMsg.MEMBER_NOT_FOUND);
  }

  member.roleId = new mongoose.Types.ObjectId(roleId);
  await shop.save();
  return shop;
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

  // Check if role exists
  const role = await Roles.findById(memberData.roleId);
  if (!role) throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);

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
