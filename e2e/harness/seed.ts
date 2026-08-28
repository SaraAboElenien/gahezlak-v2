/**
 * Deterministic fixture data for the end-to-end suite.
 *
 * Every spec starts from exactly this state: the control server drops all
 * collections and re-runs `seedAll()` before each test, so nothing a test does
 * can leak into the next one and specs never have to clean up after themselves.
 *
 * Deliberately reuses the backend's own Mongoose models and its real `signUp`
 * service rather than hand-writing documents with a raw driver. Two reasons:
 * the schemas stay the single source of truth (a field rename breaks the seed
 * loudly instead of producing subtly wrong fixtures), and the seeded owner's
 * password is hashed by the same code path login verifies against, so a change
 * to `config/bcrypt.ts` can never leave the fixture unable to log in.
 *
 * The three things that CANNOT be created through the app's own API are the
 * three seeded directly here: roles (no endpoint at all), a plan (needs an
 * admin *and* a live Paymob MOTO integration) and a subscription (needs a real
 * Paymob checkout). Everything else the specs exercise goes through the UI.
 */
import { connectDB } from "../../backend/config/db";
import { Role, Roles } from "../../backend/models/Role";
import { Users } from "../../backend/models/User";
import { Shops } from "../../backend/models/Shop";
import { Plans } from "../../backend/models/Plan";
import {
  Subscriptions,
  SubscriptionStatus,
} from "../../backend/models/Subscription";
import { CategoryModel } from "../../backend/models/Category";
import { MenuItemModel } from "../../backend/models/MenuItem";
import { signUp } from "../../backend/services/auth.service";
import { SEED } from "./config";

/**
 * A 1x1 transparent GIF. Used for the seeded shop's logo/QR so the pages under
 * test render real <img> elements without any network request — an http URL
 * here would produce a console error on every page load and muddy failures.
 */
const INLINE_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** `mongoose` is reached through a model so the harness binds to the *backend's* copy. */
const mongoose = Shops.base;

export async function connect(): Promise<void> {
  await connectDB();
}

export async function dropAll(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}

export interface SeededIds {
  shopId: string;
  ownerId: string;
  categoryIds: { starters: string; mains: string; drinks: string };
  itemIds: Record<keyof typeof SEED.items, string>;
}

export async function seedAll(): Promise<SeededIds> {
  // --- Roles. Registration fails outright without the `user` role. ---------
  await Roles.insertMany(
    Object.values(Role).map((name) => ({ name })),
    { ordered: true },
  );
  const roleByName = new Map(
    (await Roles.find().lean()).map((role) => [role.name, role._id]),
  );

  // --- Plan ---------------------------------------------------------------
  const plan = await Plans.create({
    planGroup: "Starter",
    title: "Starter Monthly",
    description: "E2E fixture plan.",
    frequency: "monthly",
    currency: "EGP",
    price: 299,
    // A real deployment gets this back from Paymob; nothing in the journeys
    // under test reads it, so a fixed sentinel keeps the seed offline.
    paymobPlanId: 1,
    features: ["QR ordering", "Unlimited menu items"],
    trialPeriodDays: 14,
  });

  // --- Owner. Created through the real registration service so the stored
  // password hash is produced by exactly the code login checks against. ------
  await signUp({ ...SEED.owner });
  const owner = await Users.findOne({
    email: SEED.owner.email.toLowerCase(),
  }).orFail();

  // --- Shop ---------------------------------------------------------------
  const shop = await Shops.create({
    ...SEED.shop,
    ownerId: owner._id,
    // No qrCodeUrl: the QR is rendered on demand by
    // GET /shops/name/:shopName/qr-code.png and is stored nowhere.
    logoUrl: INLINE_IMAGE,
    members: [{ userId: owner._id, roleId: roleByName.get(Role.SHOP_OWNER)! }],
  });

  // --- Subscription (active, well inside its period) ----------------------
  const now = new Date();
  const subscription = await Subscriptions.create({
    userId: owner._id,
    shop: shop._id,
    plan: plan._id,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    isTrialUsed: true,
  });

  // Easy to forget and silently breaks the profile-population chain the
  // dashboard's route guards depend on.
  shop.subscriptionId = subscription._id;
  await shop.save();

  await Users.updateOne(
    { _id: owner._id },
    {
      $set: {
        isVerified: true,
        verificationCode: { code: null, expireAt: null, reason: null },
        role: roleByName.get(Role.SHOP_OWNER),
        shop: shop._id,
      },
    },
  );

  // --- Menu ---------------------------------------------------------------
  const [starters, mains, drinks] = await CategoryModel.insertMany([
    { shopId: shop._id, name: SEED.categories.starters },
    { shopId: shop._id, name: SEED.categories.mains },
    { shopId: shop._id, name: SEED.categories.drinks },
  ]);

  const items = await MenuItemModel.insertMany([
    {
      shopId: shop._id,
      categoryId: starters._id,
      name: SEED.items.hummus,
      description: {
        en: "Chickpeas whipped with tahini and lemon",
        ar: "حمص مخفوق بالطحينة والليمون",
      },
      price: SEED.items.hummus.price,
      imgUrl: INLINE_IMAGE,
    },
    {
      shopId: shop._id,
      categoryId: mains._id,
      name: SEED.items.grill,
      description: {
        en: "Kofta, shish tawook and lamb chops",
        ar: "كفتة وشيش طاووق وريش ضاني",
      },
      price: SEED.items.grill.price,
      imgUrl: INLINE_IMAGE,
      options: [SEED.options.side, SEED.options.extras],
    },
    {
      shopId: shop._id,
      categoryId: mains._id,
      name: SEED.items.koshary,
      description: {
        en: "Rice, lentils, pasta and fried onion",
        ar: "أرز وعدس ومكرونة وبصل محمر",
      },
      price: SEED.items.koshary.price,
      discountPercentage: SEED.items.koshary.discount,
      imgUrl: INLINE_IMAGE,
    },
    {
      shopId: shop._id,
      categoryId: mains._id,
      name: SEED.items.soldOut,
      description: { en: "Not available today", ar: "غير متاح اليوم" },
      price: SEED.items.soldOut.price,
      isAvailable: false,
      imgUrl: INLINE_IMAGE,
    },
    {
      shopId: shop._id,
      categoryId: drinks._id,
      name: SEED.items.lemonade,
      description: { en: "Fresh lemon and mint", ar: "ليمون طازج ونعناع" },
      price: SEED.items.lemonade.price,
      imgUrl: INLINE_IMAGE,
    },
  ]);

  const idFor = (english: string) =>
    items.find((item) => item.name.en === english)!._id.toString();

  return {
    shopId: shop._id.toString(),
    ownerId: owner._id.toString(),
    categoryIds: {
      starters: starters._id.toString(),
      mains: mains._id.toString(),
      drinks: drinks._id.toString(),
    },
    itemIds: {
      hummus: idFor(SEED.items.hummus.en),
      grill: idFor(SEED.items.grill.en),
      koshary: idFor(SEED.items.koshary.en),
      soldOut: idFor(SEED.items.soldOut.en),
      lemonade: idFor(SEED.items.lemonade.en),
    },
  };
}

export async function reseed(): Promise<SeededIds> {
  await dropAll();
  return seedAll();
}
