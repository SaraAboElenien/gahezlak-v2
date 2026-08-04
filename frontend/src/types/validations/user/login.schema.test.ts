import { describe, it, expect } from "vitest";
import { loginSchema } from "./login.schema";

describe("loginSchema", () => {
  it("passes for a valid payload", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "SecurePass123!",
    });
    expect(result.success).toBe(true);
  });

  it("fails for an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "SecurePass123!",
    });
    expect(result.success).toBe(false);
  });

  it("fails when password is shorter than 8 characters", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "short1!",
    });
    expect(result.success).toBe(false);
  });

  it("fails when required fields are missing", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
