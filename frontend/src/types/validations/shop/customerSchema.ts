import { z } from "zod";
import { egyptianPhoneRegex } from "@/types/validations/shared/phone.schema";

// Error messages for different languages
const errorMessages = {
  en: {
    firstNameRequired: "First name is required",
    lastNameRequired: "Last name is required",
    phoneInvalid: "Phone number is invalid",
    paymentMethodRequired: "Payment method is required",
    orderTypeRequired: "Please select an order type",
    tableNumberRequired: "Table number is required for dine in orders",
    tableNumberInvalid: "Table number must be a valid number",
  },
  ar: {
    firstNameRequired: "الاسم الأول مطلوب",
    lastNameRequired: "اسم العائلة مطلوب",
    phoneInvalid: "رقم الهاتف غير صالح",
    paymentMethodRequired: "طريقة الدفع مطلوبة",
    orderTypeRequired: "يرجى اختيار نوع الطلب",
    tableNumberRequired: "رقم الطاولة مطلوب للطلبات في المطعم",
    tableNumberInvalid: "رقم الطاولة يجب أن يكون رقماً صحيحاً",
  },
};

export const createCustomerSchema = (language: "en" | "ar" = "en") => {
  const messages = errorMessages[language];

  return z
    .object({
      firstName: z.string().min(1, messages.firstNameRequired),
      lastName: z.string().min(1, messages.lastNameRequired),
      phone: z
        .string()
        .min(10, "Phone number is required")
        .regex(egyptianPhoneRegex, "Invalid Egyptian phone number"),
      orderType: z.enum(["dineIn", "takeaway"], {
        required_error: messages.orderTypeRequired,
        invalid_type_error: messages.orderTypeRequired,
      }),
      tableNumber: z.coerce
        .number()
        .int()
        .positive(messages.tableNumberInvalid)
        .optional(),
      paymentMethod: z.enum(["Cash", "CreditCard"], {
        required_error: messages.paymentMethodRequired,
        invalid_type_error: messages.paymentMethodRequired,
      }),
      customizationDetails: z.string().optional(),
    })
    .refine(
      (data) => {
        // Custom validation: if orderType is dineIn, tableNumber is required
        if (
          data.orderType === "dineIn" &&
          (!data.tableNumber || data.tableNumber <= 0)
        ) {
          return false;
        }
        return true;
      },
      {
        message: messages.tableNumberRequired,
        path: ["tableNumber"], // This will show the error on the tableNumber field
      },
    );
};

// Default schema for backward compatibility
export const customerSchema = createCustomerSchema("en");

export type CustomerFormData = z.infer<typeof customerSchema>;
