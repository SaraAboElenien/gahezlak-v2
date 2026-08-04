import { z } from "zod";
import { egyptianPhoneRegex } from "@/types/validations/shared/phone.schema";

export const shopSchema = z.object({
  name: z
    .string()
    .min(2, "Shop name is required")
    .max(25, "Shop name must be less than 25 characters."),
  type: z
    .string()
    .min(2, "Type is required")
    .max(25, "Type must be less than 25 characters."),
  address: z.object({
    country: z
      .string()
      .min(2, "Country is required")
      .max(20, "Country must be less than 25 characters."),
    city: z
      .string()
      .min(2, "City is required")
      .max(20, "City must be less than 25 characters."),
    street: z
      .string()
      .min(2, "Street is required")
      .max(20, "Street must be less than 25 characters."),
  }),
  logo: z
    .union([
      z.string().url("Invalid URL format").min(1, "URL cannot be empty"),
      z
        .instanceof(FileList)
        .refine(
          (files) => files.length === 0 || files.length === 1,
          "Please select only one image file",
        ),
    ])
    .optional(),
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .min(10, "Phone number ")
    .regex(
      egyptianPhoneRegex,
      "Invalid Egyptian phone number. must be at least 11 digits",
    ),
  email: z.string().email("Invalid email"),
  logoUrl: z
    .instanceof(FileList)
    .optional()
    .refine((file) => !file || file.length === 0 || file.length === 1, {
      message: "Please select only one image file",
    }),
});

export type ShopFormData = z.infer<typeof shopSchema>;

export const ownerProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(25, "First name must be less than 25 characters."),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .max(25, "Last name must be less than 25 characters."),
  phoneNumber: z
    .string()
    .min(1, "Phone number is required")
    .min(10, "Phone number ")
    .regex(
      egyptianPhoneRegex,
      "Invalid Egyptian phone number. must be at least 11 digits",
    ),
});

export type OwnerProfileFormData = z.infer<typeof ownerProfileSchema>;
