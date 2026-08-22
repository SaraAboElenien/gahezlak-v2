import { describe, it, expect } from "vitest";
import { escapeRegex } from "../../utils/escape-regex";

/**
 * The point of this helper is that admin `search` parameters stop being code.
 *
 * Four list endpoints handed caller-supplied text to Mongo as `{ $regex }`,
 * which the database server compiles as a real pattern. Two consequences, and
 * the second is the one that matters: a name containing "(" made a reasonable
 * search return 500, and a catastrophically backtracking pattern was evaluated
 * by mongod itself — pinning a core shared by every tenant.
 */
describe("escapeRegex", () => {
  it("makes a metacharacter match itself", () => {
    const pattern = new RegExp(escapeRegex("Joe's Diner (Downtown)"), "i");

    expect(pattern.test("joe's diner (downtown)")).toBe(true);
    // Unescaped, the parentheses would be a capture group and this would match.
    expect(pattern.test("Joe's Diner Downtown")).toBe(false);
  });

  it("neutralises a catastrophically backtracking pattern", () => {
    // Unescaped, matching this against a long non-matching string is the
    // classic ReDoS: exponential in the input length. Escaped, it is a literal
    // and cannot match anything but itself.
    const evil = "(a+)+$";
    const pattern = new RegExp(escapeRegex(evil));

    const started = Date.now();
    expect(pattern.test("a".repeat(40) + "b")).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);

    expect(pattern.test("(a+)+$")).toBe(true);
  });

  it("does not throw on input that is not a valid pattern on its own", () => {
    // `new RegExp("[")` throws. This is the 500-on-a-normal-search case.
    expect(() => new RegExp(escapeRegex("["))).not.toThrow();
    expect(new RegExp(escapeRegex("[")).test("[")).toBe(true);
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeRegex("Fauget")).toBe("Fauget");
    expect(escapeRegex("محمد")).toBe("محمد");
  });

  it("escapes every JavaScript regex metacharacter", () => {
    for (const ch of [
      ".",
      "*",
      "+",
      "?",
      "^",
      "$",
      "{",
      "}",
      "(",
      ")",
      "|",
      "[",
      "]",
      "\\",
    ]) {
      expect(escapeRegex(ch)).toBe(`\\${ch}`);
      expect(new RegExp(escapeRegex(ch)).test(ch)).toBe(true);
    }
  });
});
