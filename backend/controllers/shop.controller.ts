import { RequestHandler } from "express";
import * as ShopService from "../services/shop.service";
import { IShop } from "../models/Shop";
import { SuccessResponse } from "../common/types/controller-response.types";
import { Users } from "../models/User";
import { Types } from "mongoose";
import { generateMenuQRCodeBuffer } from "../utils/qr-code-generator";
import { uploadImage } from "../utils/upload-image";
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
  const { userId } = requireUser(req);

  // Upload logo image to imgbb (if provided)
  let logoUrl;
  if (req.file) {
    const uploaded = await uploadImage(req.file);
    logoUrl = uploaded.url;
  }

  // No QR code is generated here any more — it used to be rendered once and
  // uploaded to imgbb, which both baked the encoded URL in at this one moment
  // and depended on an imgbb call that started failing for every deployed
  // request. `GET /shops/name/:shopName/qr-code.png` renders it on demand
  // from the shop's current name instead, so shop creation no longer needs
  // network access to imgbb at all.
  //
  // Create the shop. `payload`'s type is a compile-time constraint only —
  // `...req.body` is whatever JSON the client actually sent, which could
  // carry fields like `subscriptionId`/`isPaymentDone` this type doesn't
  // name. ShopService.createShop applies its own runtime allowlist
  // (CREATABLE_SHOP_FIELDS) before persisting, so this spread is safe despite
  // looking otherwise.
  const payload: Parameters<typeof ShopService.createShop>[0] = {
    ...req.body,
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
    const uploaded = await uploadImage(req.file);
    logoUrl = uploaded.url;
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
 * Public per-shop QR code image, generated on demand.
 *
 * There is no "regenerate" endpoint any more (removed — it used to render a
 * PNG, upload it to imgbb, and store the returned URL on the shop). Once
 * generation is on demand, "regenerate" is not a meaningful operation: this
 * same handler renders the current PNG on every call, so it is always already
 * current. It replaces both the old create-time generation and the old
 * `POST /shops/qr-code` regeneration in one endpoint.
 *
 * Unauthenticated on purpose — the dashboard's <img> tag has no reason to
 * carry a bearer token to fetch its own QR code, and the image is meant to be
 * directly linkable (a print shop, a shared link) the same way the old imgbb
 * URL was. `qrCodeRateLimiter` (router-level, see shop.routes.ts) is what
 * keeps that safe: every request here does a real DB lookup plus a PNG
 * encode, so it is not free to call even though it costs no third-party
 * money.
 */
export const getShopQrCodeHandler: RequestHandler<
  { shopName: string },
  Buffer,
  unknown
> = async (req, res) => {
  const shop = await ShopService.getShop({ shopName: req.params.shopName });

  const { buffer } = await generateMenuQRCodeBuffer(shop.name);

  // Deliberately not cached indefinitely: the image is a pure function of the
  // shop's *current* name and FRONTEND_URL, and both can change (a rename, an
  // origin change) — the entire reason this endpoint exists instead of a
  // stored URL is so that change is picked up automatically. `max-age=0`
  // forces a browser to revalidate rather than hold its own copy forever;
  // `s-maxage=3600` still lets a shared/CDN cache absorb repeat hits for an
  // hour without making a stale image durable, which matters given the route
  // is public and rate-limited rather than free. Mirrors
  // getPublicShopListHandler's choice above for the same reason.
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.setHeader("Content-Type", "image/png");
  res.status(200).send(buffer);
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
