import z from "zod";
import { strongPasswordSchema } from "@/types/validations/shared/password.schema";
import { egyptianPhoneRegex } from "@/types/validations/shared/phone.schema";

export { strongPasswordSchema };

export const addStaffSchema = z
  .object({
    firstName: z
      .string()
      .min(2, "First name is required")
      .max(25, "First name must be less than 25 characters."),
    lastName: z
      .string()
      .min(2, "Last name is required")
      .max(25, "First name must be less than 25 characters."),
    email: z.string().min(2, "Email is required").email("Invalid email"),
    phoneNumber: z
      .string()
      .min(1, "Phone number is required")
      .min(10, "Phone number ")
      .regex(
        egyptianPhoneRegex,
        "Invalid Egyptian phone number. must be at least 11 digits",
      ),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
    roleId: z.string().min(1, "Role is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AddStaffForm = z.infer<typeof addStaffSchema>;

export type AddStaffRequest = Omit<AddStaffForm, "confirmPassword">;
