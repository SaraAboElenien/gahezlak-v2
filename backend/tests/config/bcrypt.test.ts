import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// SALT_ROUNDS is computed at module-load time from process.env, so each
// case needs vi.resetModules() + a fresh dynamic import to re-evaluate it
// under different env conditions.

describe("config/bcrypt SALT_ROUNDS", () => {
  const ORIGINAL_ENV = process.env.BCRYPT_SALT_ROUNDS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.BCRYPT_SALT_ROUNDS;
    else process.env.BCRYPT_SALT_ROUNDS = ORIGINAL_ENV;
  });

  it("defaults to 10 when BCRYPT_SALT_ROUNDS is unset", async () => {
    delete process.env.BCRYPT_SALT_ROUNDS;
    const { SALT_ROUNDS } = await import("../../config/bcrypt");
    expect(SALT_ROUNDS).toBe(10);
  });

  it("respects BCRYPT_SALT_ROUNDS when set", async () => {
    process.env.BCRYPT_SALT_ROUNDS = "12";
    const { SALT_ROUNDS } = await import("../../config/bcrypt");
    expect(SALT_ROUNDS).toBe(12);
  });
});
