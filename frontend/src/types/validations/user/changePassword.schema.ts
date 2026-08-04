import z from "zod";

export const passwordChangeSchema = z
  .object({
    oldPassword: z.string().min(8, "Minimum 8 characters"),
    newPassword: z
      .string()
      .min(8, "Minimum 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        "Password must contain at least one lowercase letter, one uppercase letter, and one number",
      ),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don't match",
    path: ["confirmNewPassword"],
  });

export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;
