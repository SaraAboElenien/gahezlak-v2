/**
 * Escape a user-supplied string so it matches literally inside a regular
 * expression instead of being interpreted as one.
 *
 * Every admin list endpoint in this codebase takes a `search` query parameter
 * and hands it straight to Mongo as `{ $regex: search }`. Mongo compiles that
 * with PCRE, so the input is code, not data. Two consequences, neither of which
 * looks like a security bug from the endpoint's shape:
 *
 *   - Searching for a customer whose name contains "(" makes the query throw,
 *     which surfaces as a 500 on a perfectly reasonable admin action.
 *   - A catastrophically backtracking pattern such as `(a+)+$` is evaluated by
 *     the *database server*, not the API process, so it pins a mongod core for
 *     as long as it runs. That is a denial of service against every tenant at
 *     once, from an endpoint that is only meant to filter a list.
 *
 * Escaping the input makes the search mean what a user typing into a search box
 * expects it to mean, which is also the safe behaviour. The character class is
 * the standard one — every metacharacter in JavaScript regex syntax.
 *
 * Note `-` is deliberately not escaped: it is only special inside a character
 * class, and this helper never places the result inside one.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
