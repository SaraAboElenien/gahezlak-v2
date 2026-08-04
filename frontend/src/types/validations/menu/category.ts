import { z } from "zod";

// Language validation helpers
const isEnglish = (str: string) => /^[a-zA-Z0-9\s.,!?'"-]+$/.test(str);
const isArabic = (str: string) => /^[\u0600-\u06FF\s0-9.,!?'"-]+$/.test(str);

export const categorySchema = z.object({
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
  description: z.object({
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
  }),
});

export type CategoryFormInputs = z.infer<typeof categorySchema>;
