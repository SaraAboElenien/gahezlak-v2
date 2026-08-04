import { describe, it, expect } from "vitest";
import { registerSchema, strongPasswordSchema } from "./register.schema";

const validPayload = {
  firstName: "Test Bistro",
  lastName: "Owner Name",
  email: "owner@example.com",
  phoneNumber: "01012345678",
  password: "StrongPass1!",
  confirmPassword: "StrongPass1!",
  terms: true as const,
};

describe("registerSchema", () => {
  it("passes for a fully valid payload", () => {
    const result = registerSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("fails when confirmPassword does not match password", () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      confirmPassword: "SomethingElse1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.issues.find((issue) =>
        issue.path.includes("confirmPassword"),
      );
      expect(confirmError).toBeDefined();
      expect(confirmError?.message).toBe("Passwords do not match");
    }
  });

  it("fails for an invalid email", () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("fails for an invalid Egyptian phone number", () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      phoneNumber: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid Egyptian phone number with +2 prefix", () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      phoneNumber: "+201012345678",
    });
    expect(result.success).toBe(true);
  });

  it("fails when terms is not accepted", () => {
    const result = registerSchema.safeParse({
      ...validPayload,
      terms: false,
    });
    expect(result.success).toBe(false);
  });

  it("fails when terms is missing entirely", () => {
    const { terms, ...withoutTerms } = validPayload;
    void terms;
    const result = registerSchema.safeParse(withoutTerms);
    expect(result.success).toBe(false);
  });
});

describe("strongPasswordSchema", () => {
  it("passes for a password satisfying all four strength rules", () => {
    const result = strongPasswordSchema.safeParse("StrongPass1!");
    expect(result.success).toBe(true);
  });

  it("fails when shorter than 8 characters", () => {
    const result = strongPasswordSchema.safeParse("Sp1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("at least 8 characters"),
        ),
      ).toBe(true);
    }
  });

  it("fails when missing an uppercase letter", () => {
    const result = strongPasswordSchema.safeParse("weakpass1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("uppercase")),
      ).toBe(true);
    }
  });

  it("fails when missing a lowercase letter", () => {
    const result = strongPasswordSchema.safeParse("WEAKPASS1!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("lowercase")),
      ).toBe(true);
    }
  });

  it("fails when missing a number", () => {
    const result = strongPasswordSchema.safeParse("WeakPassword!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("number")),
      ).toBe(true);
    }
  });

  it("fails when missing a special character", () => {
    const result = strongPasswordSchema.safeParse("WeakPassword1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("special character"),
        ),
      ).toBe(true);
    }
  });
});
