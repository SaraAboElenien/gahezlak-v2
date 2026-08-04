import type { Category } from "./category";
import type { MenuItem as ApiMenuItem } from "./menuItem";

export const categories: Category[] = [
  {
    _id: "1",
    name: {
      en: "Main Dishes",
      ar: "أطباق رئيسية",
    },
  },
  {
    _id: "2",
    name: {
      en: "Salads",
      ar: "سلطات",
    },
  },
  {
    _id: "3",
    name: {
      en: "Pizza",
      ar: "بيتزا",
    },
  },
  {
    _id: "4",
    name: {
      en: "Pasta",
      ar: "باستا",
    },
  },
  {
    _id: "5",
    name: {
      en: "Desserts",
      ar: "حلويات",
    },
  },
  {
    _id: "6",
    name: {
      en: "Burgers",
      ar: "برجر",
    },
  },
  {
    _id: "7",
    name: {
      en: "Drinks",
      ar: "مشروبات",
    },
  },
];

export const menuItems: ApiMenuItem[] = [
  {
    _id: "1",
    name: {
      en: "Luxury Caesar Salad",
      ar: "سلطة قيصر فاخرة",
    },
    description: {
      en: "Crispy green salad with grilled chicken, creamy Caesar dressing, and Parmesan cheese",
      ar: "سلطة خضراء مقرمشة مع دجاج مشوي وصلصة قيصر كريمية وجبن بارميزان",
    },
    price: 24,
    imgUrl:
      "https://images.pexels.com/photos/1059905/pexels-photo-1059905.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "2",
    isAvailable: true,
    discountPercentage: 10,
    options: [
      {
        _id: "size-1",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "s", name: { en: "Small", ar: "صغير" }, price: 0 },
          { _id: "m", name: { en: "Medium", ar: "متوسط" }, price: 6 },
          { _id: "l", name: { en: "Large", ar: "كبير" }, price: 12 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "2",
    name: {
      en: "Herb Grilled Chicken",
      ar: "دجاج مشوي بالأعشاب",
    },
    description: {
      en: "Tender grilled chicken with special herb marinade and fresh side salad",
      ar: "دجاج مشوي طري مع تتبيلة الأعشاب الخاصة وسلطة جانبية طازجة",
    },
    price: 42,
    imgUrl:
      "https://images.pexels.com/photos/1247677/pexels-photo-1247677.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "1",
    isAvailable: true,
    discountPercentage: 50,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "3",
    name: {
      en: "Classic Authentic Burger",
      ar: "برجر كلاسيكي أصيل",
    },
    description: {
      en: "Grilled beef burger with fresh vegetables and special sauce with 4 flavors",
      ar: "برجر لحم بقري مشوي مع خضروات طازجة وصلصة خاصة بأربع نكهات",
    },
    price: 28,
    imgUrl:
      "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "6",
    isAvailable: true,
    discountPercentage: 10,
    options: [
      {
        _id: "size-3",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "s", name: { en: "Small", ar: "صغير" }, price: 5 },
          { _id: "m", name: { en: "Medium", ar: "متوسط" }, price: 26 },
          { _id: "l", name: { en: "Large", ar: "كبير" }, price: 49 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "4",
    name: {
      en: "Chocolate Cake",
      ar: "كيك الشوكولاتة",
    },
    description: {
      en: "Creamy chocolate cake dessert with a layer of fresh strawberry sauce",
      ar: "حلوى كيك شوكولاتة كريمية مع طبقة من صلصة الفراولة الطازجة",
    },
    price: 18,
    imgUrl:
      "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "5",
    isAvailable: true,
    discountPercentage: 10,
    options: [
      {
        _id: "size-4",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "s", name: { en: "Small", ar: "صغير" }, price: 36 },
          { _id: "m", name: { en: "Medium", ar: "متوسط" }, price: 43 },
          { _id: "l", name: { en: "Large", ar: "كبير" }, price: 61 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "5",
    name: {
      en: "Creamy Mushroom Pasta",
      ar: "باستا الفطر الكريمية",
    },
    description: {
      en: "Soft pasta with creamy sauce, fresh mushrooms, and aromatic herbs",
      ar: "باستا ناعمة مع صلصة كريمية وفطر طازج وأعشاب عطرية",
    },
    price: 32,
    imgUrl:
      "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "4",
    isAvailable: true,
    discountPercentage: 10,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "6",
    name: {
      en: "Margherita Pizza",
      ar: "بيتزا مارجريتا",
    },
    description: {
      en: "Classic pizza with tomato sauce, mozzarella cheese, and fresh basil",
      ar: "بيتزا كلاسيكية مع صلصة الطماطم وجبن الموزاريلا والريحان الطازج",
    },
    price: 35,
    imgUrl:
      "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "3",
    isAvailable: true,
    discountPercentage: 10,
    options: [
      {
        _id: "size-6",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "s", name: { en: "Small", ar: "صغير" }, price: 23 },
          { _id: "m", name: { en: "Medium", ar: "متوسط" }, price: 29 },
          { _id: "l", name: { en: "Large", ar: "كبير" }, price: 50 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "7",
    name: {
      en: "Grilled Steak with Veggies",
      ar: "ستيك مشوي مع الخضروات",
    },
    description: {
      en: "Juicy grilled beef steak served with a side of seasonal vegetables and mashed potatoes",
      ar: "ستيك لحم بقري عصير مشوي يقدم مع خضروات موسمية وبطاطس مهروسة",
    },
    price: 58,
    imgUrl:
      "https://images.pexels.com/photos/675951/pexels-photo-675951.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "1",
    isAvailable: true,
    discountPercentage: 15,
    options: [
      {
        _id: "size-7",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "regular", name: { en: "Regular", ar: "عادي" }, price: 0 },
          { _id: "large", name: { en: "Large", ar: "كبير" }, price: 14 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "8",
    name: {
      en: "Mediterranean Quinoa Salad",
      ar: "سلطة الكينوا المتوسطية",
    },
    description: {
      en: "Healthy quinoa salad with olives, feta cheese, cucumber, and a lemon vinaigrette",
      ar: "سلطة كينوا صحية مع الزيتون وجبن الفيتا والخيار وصلصة الليمون",
    },
    price: 22,
    imgUrl:
      "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "2",
    isAvailable: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "9",
    name: {
      en: "Four Cheese Pizza",
      ar: "بيتزا الأربع جبن",
    },
    description: {
      en: "Rich pizza topped with a blend of mozzarella, cheddar, parmesan, and blue cheese",
      ar: "بيتزا غنية مغطاة بمزيج من الموزاريلا والشيدر والبارميزان والجبن الأزرق",
    },
    price: 45,
    imgUrl:
      "https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "3",
    isAvailable: true,
    discountPercentage: 20,
    options: [
      {
        _id: "size-9",
        name: { en: "Size", ar: "الحجم" },
        type: "single",
        required: true,
        choices: [
          { _id: "s", name: { en: "Small", ar: "صغير" }, price: 0 },
          { _id: "m", name: { en: "Medium", ar: "متوسط" }, price: 10 },
          { _id: "l", name: { en: "Large", ar: "كبير" }, price: 20 },
        ],
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "10",
    name: {
      en: "Penne Alfredo",
      ar: "بيني ألفريدو",
    },
    description: {
      en: "Creamy Alfredo sauce tossed with penne pasta and grilled chicken",
      ar: "صلصة ألفريدو كريمية مع باستا البيني والدجاج المشوي",
    },
    price: 34,
    imgUrl:
      "https://images.pexels.com/photos/1438672/pexels-photo-1438672.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "4",
    isAvailable: true,
    discountPercentage: 10,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "11",
    name: {
      en: "Molten Chocolate Cake",
      ar: "كيك الشوكولاتة الذائب",
    },
    description: {
      en: "Warm chocolate cake with a gooey center served with vanilla ice cream",
      ar: "كيك شوكولاتة دافئ مع مركز لزج يقدم مع آيس كريم الفانيليا",
    },
    price: 26,
    imgUrl:
      "https://images.pexels.com/photos/5638516/pexels-photo-5638516.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "5",
    isAvailable: true,
    discountPercentage: 5,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    _id: "12",
    name: {
      en: "Iced Caramel Latte",
      ar: "لاتيه كراميل مثلج",
    },
    description: {
      en: "Chilled espresso drink with creamy milk and sweet caramel drizzle",
      ar: "مشروب إسبريسو بارد مع حليب كريمي وكراميل حلو",
    },
    price: 18,
    imgUrl:
      "https://images.pexels.com/photos/302902/pexels-photo-302902.jpeg?auto=compress&cs=tinysrgb&w=400",
    categoryId: "7",
    isAvailable: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
];
