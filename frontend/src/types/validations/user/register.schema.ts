import { z } from "zod";
import { strongPasswordSchema } from "@/types/validations/shared/password.schema";
import { egyptianPhoneRegex } from "@/types/validations/shared/phone.schema";

export { strongPasswordSchema };

export const registerSchema = z
  .object({
    firstName: z.string().min(2, "Restaurant name is required"),
    lastName: z.string().min(2, "Owner name is required"),
    email: z.string().email("Invalid email"),
    phoneNumber: z
      .string()
      .min(10, "Phone number is required")
      .regex(egyptianPhoneRegex, "Invalid Egyptian phone number"),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
    terms: z.literal(true, {
      errorMap: () => ({ message: "You must agree to the terms" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const registerSchema2 = z
  .object({
    firstName: z.string().min(2, "Restaurant name is required"),
    lastName: z.string().min(2, "Owner name is required"),
    email: z.string().email("Invalid email"),
    phoneNumber: z
      .string()
      .min(10, "Phone number is required")
      .regex(egyptianPhoneRegex, "Invalid Egyptian phone number"),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;
export type RegisterFormDataUser = z.infer<typeof registerSchema2>;
