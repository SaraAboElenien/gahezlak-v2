import { z } from "zod";
import { strongPasswordSchema } from "@/types/validations/shared/password.schema";

export { strongPasswordSchema };

export const resetPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
});
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export const verifyCodeSchema = z.object({
  email: z.string().email("Invalid email"),
  code: z.string().min(6).max(6),
});
export type VerifyCodeFormData = z.infer<typeof verifyCodeSchema>;

export const resetPasswordFinalSchema = z
  .object({
    email: z.string().email("Invalid email"),
    code: z
      .string()
      .min(6, "code muse be 6 charcters")
      .max(6, "code muse be 6 charcters"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFinalFormData = z.infer<
  typeof resetPasswordFinalSchema
>;

export const resendCodeSchema = z.object({
  email: z.string().email("Invalid email"),
  reason: z.string(),
});

export type ResendCodeFormData = z.infer<typeof resendCodeSchema>;

export interface ResetScema {
  email: string;
  code: string;
  newPassword: string;
}

export const verifyCodeChangeMailSchema = z.object({
  code: z.string().min(6).max(6),
});
export type VerifyCodeChangeMailFormData = z.infer<
  typeof verifyCodeChangeMailSchema
>;
