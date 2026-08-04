import z from "zod";

export const sendCodeSchema = z.object({
  newEmail: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address"),
});
export type ChangeMailFormData = z.infer<typeof sendCodeSchema>;

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .min(1, "Verification code is required")
    .length(6, "Verification code must be 6 digits"),
});
