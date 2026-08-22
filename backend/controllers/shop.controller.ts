import { RequestHandler } from "express";
import * as ShopService from "../services/shop.service";
import { IShop } from "../models/Shop";
import { SuccessResponse } from "../common/types/controller-response.types";
import { Users } from "../models/User";
import { Types } from "mongoose";
import {
  generateAndUploadMenuQRCode,
  QRCodeOptions,
} from "../utils/qr-code-generator";
import uploadToImgbb from "../utils/upload-to-imgbb";
import { Role, Roles } from "../models/Role";
import { Errors } from "../errors";
import { errMsg } from "../common/err-messages";
import { cancelSubscription } from "../services/subscription.service";
import {
  removeMemberFromShop,
  updateMemberRole,
  registerShopMember,
} from "../services/shop.service";
import { PaginatedResponse } from "../common/types/controller-response.types";
import { requireUser } from "../utils/current-user";

/** No route params / no request body — `{}` would accept any non-nullish value. */
type Empty = Record<string, never>;

export const createShopHandler: RequestHandler<
  Empty,
  SuccessResponse<IShop>,
  Pick<IShop, "name" | "type" | "address" | "phoneNumber" | "email">
> = async (req, res) => {
  const { name } = req.body;
  const { userId } = requireUser(req);

  // Generate and upload QR code for the new shop
  const qrCodeResult = await generateAndUploadMenuQRCode(name);

  // Upload logo image to imgbb (if provided)
  let logoUrl;
  if (req.file) {
    const imgbbResponse = await uploadToImgbb(req.file);
    logoUrl = imgbbResponse?.data?.url;
  }

  // Create the shop
  const payload: Parameters<typeof ShopService.createShop>[0] = {
    ...req.body,
    qrCodeUrl: qrCodeResult.qrCodeUrl,
    logoUrl,
  };

  const shop = await ShopService.createShop(payload, userId);

  // Get the shop owner role
  const shopOwnerRole = await Roles.findOne({ name: Role.SHOP_OWNER });
  if (!shopOwnerRole) {
    throw new Errors.NotFoundError(errMsg.ROLE_NOT_FOUND);
  }

  // Update the user's shopId
  await Users.updateOne(
    {
      _id: new Types.ObjectId(userId),
    },
    {
      shop: shop._id,
      role: shopOwnerRole._id,
    },
  );
  res.status(201).json({
    message: "Shop created successfully",
    data: shop,
  });
};

export const updateShopHandler: RequestHandler<
  {
    shopId: string;
  },
  SuccessResponse<IShop>,
  Partial<IShop>
> = async (req, res) => {
  // Handle logo image upload if present

  let logoUrl;
  if (req.file) {
    const imgbbResponse = await uploadToImgbb(req.file);
    logoUrl = imgbbResponse?.data?.url;
  }

  const shop = await ShopService.updateShop(req.params.shopId, {
    ...req.body,
    logoUrl,
  });
  res.status(200).json({
    message: "Shop updated successfully",
    data: shop,
  });
};

// return shop details for logged in user or public
export const getShopHandler: RequestHandler<
  { shopName?: string; shopId?: string },
  SuccessResponse<IShop>,
  unknown
> = async (req, res) => {
  const shop = await ShopService.getShop({
    shopId: req.params.shopId,
    shopName: req.params.shopName,
  });
  res.status(200).json({
    message: "Shop fetched successfully",
    data: shop,
  });
};

export const getAllShops: RequestHandler<
  Empty,
  PaginatedResponse<IShop>,
  unknown,
  { page?: string; limit?: string; search?: string; order?: "asc" | "desc" }
> = async (req, res) => {
  const { page = "1", limit = "10", search = "", order = "desc" } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const { shops, total } = await ShopService.getAllShops({
    page: pageNum,
    limit: limitNum,
    search,
    order,
  });
  res.status(200).json({
    message: "Data retreived.",
    data: shops,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

/**
 * Public list of shop slugs, consumed by the frontend's generated
 * /sitemap.xml. Unauthenticated on purpose — the data it returns (a shop's
 * public URL name and when it last changed) is already public by definition,
 * since every one of these pages is meant to be crawled and shared.
 *
 * Cached at the edge for an hour: sitemaps are fetched by crawlers, not
 * users, and a shop appearing an hour late costs nothing.
 */
export const getPublicShopListHandler: RequestHandler<
  Empty,
  SuccessResponse<{ shopName: string; updatedAt: Date }[]>
> = async (req, res) => {
  const shops = await ShopService.getPublicShopList();

  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).json({
    message: "Data retreived.",
    data: shops,
  });
};

/**
 * Regenerate QR code for shop
 */
export const regenerateQRCodeHandler: RequestHandler<
  Empty,
  SuccessResponse<{ qrCodeUrl: string; menuUrl: string }>,
  Pick<QRCodeOptions, "width" | "margin" | "errorCorrectionLevel">
> = async (req, res) => {
  const { userId } = requireUser(req);
  const user = await Users.findById(userId);
  if (!user || !user.shop) {
    throw new Errors.NotFoundError(errMsg.USER_HAS_NO_SHOP);
  }

  // `validateRegenerateQRCode` bounds these at the TOP level of the body
  // (width 100-1000, margin 0-10, errorCorrectionLevel L/M/Q/H). This handler
  // used to read `req.body.options` instead, which meant the two never met:
  // a validated `{ width }` was silently discarded, while an unvalidated
  // `{ options: { width: 100000 } }` skipped the bounds entirely and reached
  // QRCode.toBuffer, allocating a 100000x100000 bitmap on an authenticated
  // request. Reading the validated fields is what closes both halves.
  const { width, margin, errorCorrectionLevel } = req.body;
  const options: QRCodeOptions = {};
  if (width !== undefined) options.width = width;
  if (margin !== undefined) options.margin = margin;
  if (errorCorrectionLevel !== undefined)
    options.errorCorrectionLevel = errorCorrectionLevel;

  const result = await ShopService.regenerateShopQRCode(
    user.shop.toString(),
    options,
  );

  res.status(200).json({
    message: "QR code regenerated successfully",
    data: result,
  });
};

// Cancel shop subscription
export const cancelShopSubscriptionHandler: RequestHandler<
  Empty,
  SuccessResponse<Empty>,
  Empty
> = async (req, res) => {
  const { userId } = requireUser(req);

  // Cancel the subscription
  await cancelSubscription(userId);

  res.status(200).json({
    message: "Shop subscription cancelled successfully",
    data: {},
  });
};

export const addMemberHandler: RequestHandler = async (req, res) => {
  const { shopId } = req.params;
  const { firstName, lastName, email, password, phoneNumber, roleId } =
    req.body;

  const newMember = await registerShopMember(shopId, {
    firstName,
    lastName,
    email,
    password,
    phoneNumber,
    roleId,
  });

  res.status(201).json({
    message: "Member added successfully",
    data: newMember,
  });
};

export const removeMemberHandler: RequestHandler = async (req, res) => {
  const { shopId, userId } = req.params;
  const shop = await removeMemberFromShop(shopId, userId);
  res.status(200).json({
    message: "Member removed successfully",
    data: shop,
  });
};

export const getShopMembersHandler: RequestHandler = async (req, res) => {
  const { shopId } = req.params;
  const members = await ShopService.getShopMembers(shopId);
  res.status(200).json({
    message: "Shop members fetched successfully",
    data: members,
  });
};

export const updateMemberRoleHandler: RequestHandler = async (req, res) => {
  const { shopId, userId } = req.params;
  const { roleId } = req.body;
  const shop = await updateMemberRole(shopId, userId, roleId);
  res.status(200).json({
    message: "Member role updated successfully",
    data: shop,
  });
};
