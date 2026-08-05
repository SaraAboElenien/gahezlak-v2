/**
 * Seeds a full, realistic menu onto a shop — categories, dishes, options,
 * discounts and availability.
 *
 * Why this exists: a demo shop with one category and one dish reads as an
 * unfinished project no matter how good the code is, and it makes the
 * dashboard's analytics, filtering, sorting and pagination impossible to
 * exercise or screenshot. Everything here is bilingual because the app is.
 *
 * Deliberately seeds no images. Photos are uploaded per item through the
 * dashboard (they go to imgbb), so `imgUrl` is left unset rather than pointed
 * at somebody else's hotlinked stock photo.
 *
 * Idempotent: a category or dish that already exists on the shop (matched by
 * its English name) is skipped, never duplicated or overwritten. Safe to
 * re-run, and safe to run against a shop that already has a few items.
 *
 *   npm run seed:menu:dev
 *   SEED_SHOP_NAME="Another Shop" npm run seed:menu:dev
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Shops } from "../models/Shop";
import { CategoryModel } from "../models/Category";
import { MenuItemModel } from "../models/MenuItem";

const SHOP_NAME = process.env.SEED_SHOP_NAME ?? "Test Bistro";

type Bilingual = { en: string; ar: string };

type SeedOption = {
  name: Bilingual;
  type: "single" | "multiple";
  required: boolean;
  choices: Array<{ name: Bilingual; price: number }>;
};

type SeedItem = {
  name: Bilingual;
  description: Bilingual;
  price: number;
  discountPercentage?: number;
  isAvailable?: boolean;
  options?: SeedOption[];
};

type SeedCategory = {
  name: Bilingual;
  description: Bilingual;
  items: SeedItem[];
};

// Reused across several dishes — defined once so the shape stays consistent.
const SIDE_CHOICE: SeedOption = {
  name: { en: "Choice of side", ar: "الطبق الجانبي" },
  type: "single",
  required: true,
  choices: [
    { name: { en: "Egyptian rice", ar: "أرز مصري" }, price: 0 },
    { name: { en: "French fries", ar: "بطاطس محمرة" }, price: 15 },
    { name: { en: "Grilled vegetables", ar: "خضار مشوي" }, price: 25 },
    { name: { en: "Oriental salad", ar: "سلطة شرقية" }, price: 20 },
  ],
};

const SANDWICH_EXTRAS: SeedOption = {
  name: { en: "Extras", ar: "إضافات" },
  type: "multiple",
  required: false,
  choices: [
    { name: { en: "Extra cheese", ar: "جبنة إضافية" }, price: 20 },
    { name: { en: "Spicy sauce", ar: "صوص حار" }, price: 5 },
    { name: { en: "Pickles", ar: "مخلل" }, price: 5 },
    { name: { en: "Tahini", ar: "طحينة" }, price: 10 },
  ],
};

const DRINK_SIZE: SeedOption = {
  name: { en: "Size", ar: "الحجم" },
  type: "single",
  required: true,
  choices: [
    { name: { en: "Regular", ar: "وسط" }, price: 0 },
    { name: { en: "Large", ar: "كبير" }, price: 20 },
  ],
};

const MENU: SeedCategory[] = [
  {
    name: { en: "Appetizers", ar: "المقبلات" },
    description: {
      en: "Small plates to start the table",
      ar: "أطباق صغيرة لبداية الوجبة",
    },
    items: [
      {
        name: { en: "Hummus", ar: "حمص" },
        description: {
          en: "Chickpeas whipped with tahini, lemon and olive oil",
          ar: "حمص مخفوق بالطحينة وعصير الليمون وزيت الزيتون",
        },
        price: 55,
      },
      {
        name: { en: "Baba Ganoush", ar: "بابا غنوج" },
        description: {
          en: "Smoked aubergine with tahini, garlic and pomegranate",
          ar: "باذنجان مدخن مع الطحينة والثوم والرمان",
        },
        price: 60,
      },
      {
        name: { en: "Vine Leaves", ar: "ورق عنب" },
        description: {
          en: "Hand-rolled vine leaves stuffed with herbed rice",
          ar: "ورق عنب محشي بالأرز والأعشاب، ملفوف يدويًا",
        },
        price: 75,
      },
      {
        name: { en: "Ta'ameya", ar: "طعمية" },
        description: {
          en: "Egyptian falafel of crushed fava beans, fried to order",
          ar: "طعمية مصرية من الفول المدشوش، تُقلى عند الطلب",
        },
        price: 45,
        discountPercentage: 15,
      },
      {
        name: { en: "Cheese Sambousek", ar: "سمبوسك جبنة" },
        description: {
          en: "Crisp pastry parcels filled with white cheese and mint",
          ar: "عجينة مقرمشة محشية بالجبنة البيضاء والنعناع",
        },
        price: 70,
      },
      {
        name: { en: "Mixed Mezze Platter", ar: "مشكل مقبلات" },
        description: {
          en: "Hummus, baba ganoush, vine leaves and ta'ameya to share",
          ar: "حمص وبابا غنوج وورق عنب وطعمية للمشاركة",
        },
        price: 165,
      },
    ],
  },
  {
    name: { en: "Soups & Salads", ar: "الشوربات والسلطات" },
    description: {
      en: "Light, fresh and warming",
      ar: "أطباق خفيفة وطازجة",
    },
    items: [
      {
        name: { en: "Lentil Soup", ar: "شوربة عدس" },
        description: {
          en: "Yellow lentils with cumin, served with croutons and lemon",
          ar: "عدس أصفر بالكمون، يُقدم مع الخبز المحمص والليمون",
        },
        price: 50,
      },
      {
        name: { en: "Seafood Soup", ar: "شوربة سيفود" },
        description: {
          en: "Shrimp, calamari and white fish in a tomato broth",
          ar: "جمبري وكاليماري وسمك أبيض في مرقة طماطم",
        },
        price: 110,
      },
      {
        name: { en: "Fattoush", ar: "فتوش" },
        description: {
          en: "Garden vegetables with sumac dressing and toasted bread",
          ar: "خضروات طازجة مع صوص السماق والخبز المحمص",
        },
        price: 75,
      },
      {
        name: { en: "Tabbouleh", ar: "تبولة" },
        description: {
          en: "Parsley, tomato and bulgur with lemon and olive oil",
          ar: "بقدونس وطماطم وبرغل مع الليمون وزيت الزيتون",
        },
        price: 70,
      },
      {
        name: { en: "Rocket & Parmesan Salad", ar: "سلطة جرجير بالبارميزان" },
        description: {
          en: "Rocket leaves, shaved parmesan and balsamic",
          ar: "جرجير وشرائح جبن بارميزان مع صوص البلسميك",
        },
        price: 85,
      },
    ],
  },
  {
    name: { en: "From the Grill", ar: "من المشواة" },
    description: {
      en: "Charcoal-grilled to order",
      ar: "مشويات على الفحم تُحضّر عند الطلب",
    },
    items: [
      {
        name: { en: "Mixed Grill", ar: "مشاوي مشكلة" },
        description: {
          en: "Kofta, shish tawook and lamb chops with rice and salad",
          ar: "كفتة وشيش طاووق وريش ضاني مع الأرز والسلطة",
        },
        price: 480,
        options: [SIDE_CHOICE],
      },
      {
        name: { en: "Shish Tawook", ar: "شيش طاووق" },
        description: {
          en: "Marinated chicken skewers with garlic sauce",
          ar: "أسياخ دجاج متبلة تُقدم مع صوص الثوم",
        },
        price: 285,
        options: [SIDE_CHOICE],
      },
      {
        name: { en: "Grilled Kofta", ar: "كفتة مشوية" },
        description: {
          en: "Minced beef with parsley and onion, char-grilled",
          ar: "لحم مفروم بالبقدونس والبصل، مشوي على الفحم",
        },
        price: 265,
        options: [SIDE_CHOICE],
      },
      {
        name: { en: "Lamb Chops", ar: "ريش ضاني" },
        description: {
          en: "Four chops grilled over charcoal with rosemary",
          ar: "أربع قطع ريش مشوية على الفحم بإكليل الجبل",
        },
        price: 520,
        options: [SIDE_CHOICE],
      },
      {
        name: { en: "Grilled Chicken", ar: "فراخ مشوية" },
        description: {
          en: "Half a chicken marinated in lemon, garlic and herbs",
          ar: "نصف دجاجة متبلة بالليمون والثوم والأعشاب",
        },
        price: 220,
        discountPercentage: 10,
        options: [SIDE_CHOICE],
      },
    ],
  },
  {
    name: { en: "Main Courses", ar: "الأطباق الرئيسية" },
    description: {
      en: "Egyptian classics, cooked slowly",
      ar: "أطباق مصرية أصيلة على نار هادئة",
    },
    items: [
      {
        name: { en: "Koshari", ar: "كشري" },
        description: {
          en: "Rice, lentils and pasta with crisp onion and tomato sauce",
          ar: "أرز وعدس ومكرونة مع البصل المقرمش وصوص الطماطم",
        },
        price: 95,
      },
      {
        name: { en: "Molokhia with Rabbit", ar: "ملوخية بالأرانب" },
        description: {
          en: "Jute leaf stew with garlic and coriander, served with rice",
          ar: "ملوخية بالثوم والكزبرة، تُقدم مع الأرز",
        },
        price: 340,
      },
      {
        name: { en: "Stuffed Pigeon", ar: "حمام محشي" },
        description: {
          en: "Two pigeons stuffed with freekeh and slow-roasted",
          ar: "حمامتان محشيتان بالفريك ومشويتان ببطء",
        },
        price: 395,
        isAvailable: false,
      },
      {
        name: { en: "Okra with Beef", ar: "بامية باللحم" },
        description: {
          en: "Baby okra slow-cooked in tomato with tender beef",
          ar: "بامية صغيرة مطهوة ببطء في الطماطم مع اللحم",
        },
        price: 245,
      },
      {
        name: { en: "Moussaka", ar: "مسقعة" },
        description: {
          en: "Layered aubergine and spiced minced beef, oven-baked",
          ar: "طبقات باذنجان ولحم مفروم متبل، مخبوزة في الفرن",
        },
        price: 180,
      },
    ],
  },
  {
    name: { en: "Seafood", ar: "المأكولات البحرية" },
    description: {
      en: "Delivered fresh each morning",
      ar: "طازجة يوميًا",
    },
    items: [
      {
        name: { en: "Grilled Sea Bass", ar: "قاروص مشوي" },
        description: {
          en: "Whole sea bass grilled with lemon, garlic and coriander",
          ar: "سمك قاروص كامل مشوي بالليمون والثوم والكزبرة",
        },
        price: 460,
        options: [SIDE_CHOICE],
      },
      {
        name: { en: "Fried Calamari", ar: "كاليماري مقلي" },
        description: {
          en: "Lightly battered calamari rings with tartar sauce",
          ar: "حلقات كاليماري مقلية مع صوص التارتار",
        },
        price: 275,
      },
      {
        name: { en: "Shrimp Tagine", ar: "طاجن جمبري" },
        description: {
          en: "Shrimp baked in a clay pot with tomato, garlic and chilli",
          ar: "جمبري في طاجن فخار مع الطماطم والثوم والشطة",
        },
        price: 395,
      },
      {
        name: { en: "Sayadeya", ar: "صيادية" },
        description: {
          en: "White fish over spiced rice with caramelised onion",
          ar: "سمك أبيض على أرز متبل مع البصل المحمر",
        },
        price: 330,
      },
      {
        name: { en: "Grilled Shrimp Skewers", ar: "أسياخ جمبري مشوي" },
        description: {
          en: "Jumbo shrimp grilled with butter and garlic",
          ar: "جمبري جامبو مشوي بالزبدة والثوم",
        },
        price: 430,
        discountPercentage: 20,
        options: [SIDE_CHOICE],
      },
    ],
  },
  {
    name: { en: "Sandwiches", ar: "السندويتشات" },
    description: {
      en: "Served in fresh baladi bread",
      ar: "تُقدم في العيش البلدي الطازج",
    },
    items: [
      {
        name: { en: "Chicken Shawarma", ar: "شاورما فراخ" },
        description: {
          en: "Shaved marinated chicken with garlic sauce and pickles",
          ar: "شرائح دجاج متبل مع صوص الثوم والمخلل",
        },
        price: 95,
        options: [SANDWICH_EXTRAS],
      },
      {
        name: { en: "Beef Shawarma", ar: "شاورما لحم" },
        description: {
          en: "Slow-roasted beef with tahini and tomato",
          ar: "لحم مشوي ببطء مع الطحينة والطماطم",
        },
        price: 115,
        options: [SANDWICH_EXTRAS],
      },
      {
        name: { en: "Ta'ameya Sandwich", ar: "سندويتش طعمية" },
        description: {
          en: "Ta'ameya with salad, tahini and pickles",
          ar: "طعمية مع السلطة والطحينة والمخلل",
        },
        price: 40,
        options: [SANDWICH_EXTRAS],
      },
      {
        name: { en: "Kofta Sandwich", ar: "سندويتش كفتة" },
        description: {
          en: "Grilled kofta with grilled tomato and tahini",
          ar: "كفتة مشوية مع الطماطم المشوية والطحينة",
        },
        price: 105,
        options: [SANDWICH_EXTRAS],
      },
      {
        name: { en: "Halloumi Wrap", ar: "راب حلومي" },
        description: {
          en: "Grilled halloumi with rocket, tomato and pesto",
          ar: "حلومي مشوي مع الجرجير والطماطم والبيستو",
        },
        price: 90,
        options: [SANDWICH_EXTRAS],
      },
    ],
  },
  {
    name: { en: "Desserts", ar: "الحلويات" },
    description: {
      en: "Made in house, every day",
      ar: "تُحضّر يوميًا في المطبخ",
    },
    items: [
      {
        name: { en: "Om Ali", ar: "أم علي" },
        description: {
          en: "Warm pastry pudding with milk, nuts and raisins",
          ar: "حلوى دافئة بالعجين واللبن والمكسرات والزبيب",
        },
        price: 85,
      },
      {
        name: { en: "Kunafa with Cream", ar: "كنافة بالقشطة" },
        description: {
          en: "Shredded pastry baked over cream, in sugar syrup",
          ar: "كنافة مخبوزة على القشطة مع الشربات",
        },
        price: 95,
      },
      {
        name: { en: "Basbousa", ar: "بسبوسة" },
        description: {
          en: "Semolina cake soaked in syrup, topped with almonds",
          ar: "كيك السميد المشبع بالشربات مع اللوز",
        },
        price: 55,
      },
      {
        name: { en: "Rice Pudding", ar: "أرز باللبن" },
        description: {
          en: "Slow-cooked rice pudding with cinnamon and pistachio",
          ar: "أرز باللبن على نار هادئة مع القرفة والفستق",
        },
        price: 60,
      },
      {
        name: { en: "Baklava", ar: "بقلاوة" },
        description: {
          en: "Layered filo with pistachio and honey",
          ar: "طبقات رقيقة بالفستق والعسل",
        },
        price: 75,
        discountPercentage: 10,
      },
    ],
  },
  {
    name: { en: "Beverages", ar: "المشروبات" },
    description: {
      en: "Fresh juices, hot drinks and soft drinks",
      ar: "عصائر طازجة ومشروبات ساخنة وباردة",
    },
    items: [
      {
        name: { en: "Fresh Mango Juice", ar: "عصير مانجو طازج" },
        description: {
          en: "Pressed to order, no added sugar",
          ar: "يُعصر عند الطلب بدون سكر مضاف",
        },
        price: 65,
        options: [DRINK_SIZE],
      },
      {
        name: { en: "Hibiscus", ar: "كركديه" },
        description: {
          en: "Served hot or iced",
          ar: "يُقدم ساخنًا أو باردًا",
        },
        price: 35,
        options: [DRINK_SIZE],
      },
      {
        name: { en: "Mint Lemonade", ar: "ليمون بالنعناع" },
        description: {
          en: "Fresh lemon blended with mint over ice",
          ar: "ليمون طازج مخفوق بالنعناع مع الثلج",
        },
        price: 45,
        options: [DRINK_SIZE],
      },
      {
        name: { en: "Turkish Coffee", ar: "قهوة تركي" },
        description: {
          en: "Ground fresh, prepared to your preferred sweetness",
          ar: "تُطحن طازجة وتُحضّر حسب درجة التحلية",
        },
        price: 40,
      },
      {
        name: { en: "Black Tea", ar: "شاي" },
        description: {
          en: "Egyptian black tea, with or without mint",
          ar: "شاي مصري، بالنعناع أو بدونه",
        },
        price: 25,
      },
      {
        name: { en: "Sparkling Water", ar: "مياه غازية" },
        description: {
          en: "Chilled 330ml bottle",
          ar: "زجاجة مثلجة ٣٣٠ مل",
        },
        price: 30,
      },
    ],
  },
];

async function seedMenu() {
  await connectDB();

  const shop = await Shops.findOne({ name: SHOP_NAME });
  if (!shop) {
    throw new Error(
      `No shop named "${SHOP_NAME}". Create it first, or set SEED_SHOP_NAME to an existing shop.`,
    );
  }

  let categoriesCreated = 0;
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const group of MENU) {
    let category = await CategoryModel.findOne({
      shopId: shop._id,
      "name.en": group.name.en,
    });

    if (!category) {
      category = await CategoryModel.create({
        shopId: shop._id,
        name: group.name,
        description: group.description,
      });
      categoriesCreated += 1;
      console.log(`+ category  ${group.name.en}`);
    } else {
      console.log(`= category  ${group.name.en} (exists)`);
    }

    for (const item of group.items) {
      const exists = await MenuItemModel.findOne({
        shopId: shop._id,
        "name.en": item.name.en,
      });
      if (exists) {
        itemsSkipped += 1;
        continue;
      }

      await MenuItemModel.create({
        shopId: shop._id,
        categoryId: category._id,
        name: item.name,
        description: item.description,
        price: item.price,
        discountPercentage: item.discountPercentage ?? 0,
        isAvailable: item.isAvailable ?? true,
        options: item.options ?? [],
      });
      itemsCreated += 1;
      console.log(`  + ${item.name.en} — ${item.price} EGP`);
    }
  }

  console.log(
    `\nDone for "${SHOP_NAME}": ${categoriesCreated} categories and ${itemsCreated} dishes created, ${itemsSkipped} already present.`,
  );
  console.log(
    "Dishes have no photos — upload them per item from Dashboard → Menu.",
  );

  await mongoose.connection.close();
}

seedMenu().catch(async (err) => {
  console.error("Error seeding menu:", err);
  await mongoose.connection.close();
  process.exit(1);
});
