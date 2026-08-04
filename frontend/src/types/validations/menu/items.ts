import { z } from "zod";

// Language validation helpers
const isEnglish = (str: string) => /^[a-zA-Z0-9\s.,!?'"-]+$/.test(str);
const isArabic = (str: string) => /^[\u0600-\u06FF\s0-9.,!?'"-]+$/.test(str);

// Zod schemas for menu item
export const optionChoiceSchema = z.object({
  name: z.object({
    en: z
      .string()
      .min(1, "English choice name is required")
      .refine((val) => isEnglish(val), "Must contain only English characters"),
    ar: z
      .string()
      .min(1, "Arabic choice name is required")
      .refine((val) => isArabic(val), "يجب أن يحتوي على أحرف عربية فقط"),
  }),
  price: z.number().min(0, "Choice price must be non-negative"),
});

export const itemOptionSchema = z.object({
  name: z.object({
    en: z
      .string()
      .min(1, "English option name is required")
      .refine((val) => isEnglish(val), "Must contain only English characters"),
    ar: z
      .string()
      .min(1, "Arabic option name is required")
      .refine((val) => isArabic(val), "يجب أن يحتوي على أحرف عربية فقط"),
  }),
  type: z.enum(["single", "multiple"], {
    errorMap: () => ({ message: "Invalid option type" }),
  }),
  required: z.boolean({
    errorMap: () => ({ message: "Required must be a boolean" }),
  }),
  choices: z.array(optionChoiceSchema).min(1, "Choices must be an array"),
});

export const menuItemSchema = z.object({
  name: z.object({
    en: z
      .string()
      .min(1, "English name is required")
      .refine((val) => isEnglish(val), "Must contain only English characters"),
    ar: z
      .string()
      .min(1, "Arabic name is required")
      .refine((val) => isArabic(val), "يجب أن يحتوي على أحرف عربية فقط"),
  }),
  description: z
    .object({
      en: z
        .string()
        .optional()
        .refine(
          (val) => !val || isEnglish(val),
          "Must contain only English characters",
        ),
      ar: z
        .string()
        .optional()
        .refine(
          (val) => !val || isArabic(val),
          "يجب أن يحتوي على أحرف عربية فقط",
        ),
    })
    .optional(),
  imgUrl: z.string().optional(),
  price: z.number().min(1, "Price must be a positive number"),
  categoryId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Please select a valid category"),
  image: z
    .union([
      z.string().min(1, "Image is required").url("Invalid Image format"),
      z
        .instanceof(FileList)
        .refine(
          (files) => files.length === 0 || files.length === 1,
          "Please select only one image file",
        ),
    ])
    .optional(),
  discountPercentage: z
    .number()
    .min(0, "Discount must be between 0 and 100")
    .max(100, "Discount must be between 0 and 100")
    .optional(),
  options: z.array(itemOptionSchema).optional(),
  isAvailable: z.boolean().optional(),
});

export type MenuItemFormInputs = z.infer<typeof menuItemSchema>;
