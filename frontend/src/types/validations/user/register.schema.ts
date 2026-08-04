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

/*
Request example :

  {
  "firstName": "Dee",
  "lastName": "Cyu",
  "email": "djr511@cloneads.top",
  "password": "SecurePass123!",
  "phoneNumber": "+201234567890"
}



response after varification :
  
{
    "message": "Verification successful. You are now logged in.",
    "data": {
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODc2ZmUxMzQzYjU3MTJjOWJlYmE3MTEiLCJlbWFpbCI6Im1haG1kLmhhc2FubkBnbWFpbC5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTc1MjYyODg2OCwiZXhwIjoxNzUyNjMyNDY4fQ.eZEZ72zGs3eBxbb3b-x78urGR9fcU-AWdfgeRGDrY8o",
        "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2ODc2ZmUxMzQzYjU3MTJjOWJlYmE3MTEiLCJlbWFpbCI6Im1haG1kLmhhc2FubkBnbWFpbC5jb20iLCJpYXQiOjE3NTI2Mjg4NjgsImV4cCI6MTc1MzIzMzY2OH0.EmdB75H_MtIPsuVyKQ9EhQjOBtgcCkvgSR4_ivzKrlY",
        "user": {
            "id": "6876fe1343b5712c9beba711",
            "firstName": "test",
            "lastName": "test1",
            "email": "mahmd.hasann@gmail.com",
            "phoneNumber": "+201234567890",
            "isVerified": true
        }
    }
}



*/
