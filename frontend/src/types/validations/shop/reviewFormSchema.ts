import { z } from "zod";
import { egyptianPhoneRegex } from "@/types/validations/shared/phone.schema";

// Error messages for different languages
const errorMessages = {
  en: {
    firstNameRequired: "First name is required",
    firstNameMinLength: "First name must be at least 2 characters",
    lastNameRequired: "Last name is required",
    lastNameMinLength: "Last name must be at least 2 characters",
    phoneRequired: "Phone number is required",
    phoneInvalid: "Please enter a valid phone number",
    messageRequired: "Review message is required",
    messageMinLength: "Review message must be at least 10 characters",
    orderNumberRequired: "Order number is required",
    orderNumberInvalid: "Order number must be a valid number",
  },
  ar: {
    firstNameRequired: "الاسم الأول مطلوب",
    firstNameMinLength: "الاسم الأول يجب أن يكون حرفين على الأقل",
    lastNameRequired: "اسم العائلة مطلوب",
    lastNameMinLength: "اسم العائلة يجب أن يكون حرفين على الأقل",
    phoneRequired: "رقم الهاتف مطلوب",
    phoneInvalid: "يرجى إدخال رقم هاتف صحيح",
    messageRequired: "رسالة المراجعة مطلوبة",
    messageMinLength: "رسالة المراجعة يجب أن تكون 10 أحرف على الأقل",
    orderNumberRequired: "رقم الطلب مطلوب",
    orderNumberInvalid: "رقم الطلب يجب أن يكون رقماً صحيحاً",
  },
};

export const createReviewSchema = (language: "en" | "ar" = "en") => {
  const messages = errorMessages[language];

  return z.object({
    firstName: z
      .string()
      .min(1, messages.firstNameRequired)
      .min(2, messages.firstNameMinLength),
    lastName: z
      .string()
      .min(1, messages.lastNameRequired)
      .min(2, messages.lastNameMinLength),
    phone: z
      .string()
      .min(1, messages.phoneRequired)
      .regex(egyptianPhoneRegex, messages.phoneInvalid),
    message: z
      .string()
      .min(1, messages.messageRequired)
      .min(10, messages.messageMinLength),
    orderNumber: z.coerce
      .number({
        invalid_type_error: messages.orderNumberInvalid,
        required_error: messages.orderNumberRequired,
      })
      .int()
      .positive(messages.orderNumberInvalid),
  });
};

// Default schema for backward compatibility
export const reviewSchema = createReviewSchema("en");

export type ReviewFormData = z.infer<typeof reviewSchema>;
