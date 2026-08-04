## What & why

<!-- One or two sentences. What changed, and what problem it solves. -->

## Scope

<!-- Which package(s): backend / frontend / tooling. -->

- [ ] Changes stay inside the scope of the task — no unrelated refactors, no "while I'm here" rewrites (`PROJECT_IMPLEMENTATION_INSTRUCTIONS.md`).
- [ ] Existing behavior is preserved, or the change is explicitly a bug fix / security fix / requested change.
- [ ] Did not touch `backend/services/ai/*` or AI menu features (standing instruction — deferred until everything else is done).

## Docs updated

Pick the ones that apply; deleting the rest is fine.

- [ ] `CHANGELOG.md` — user/product-facing change (Keep a Changelog format).
- [ ] `REFACTOR_LOG.md` — pure internal refactor with no user-facing effect.
- [ ] `DECISIONS.md` — added an ADR for a non-obvious engineering decision.
- [ ] `TECH_DEBT.md` — logged debt found but deliberately not fixed here (description / why it matters / priority / recommended fix).
- [ ] `KNOWN_ISSUES.md` — product-level issue found but not fixed.
- [ ] `SECURITY.md` — changed something in the implemented-vs-pending security picture.
- [ ] N/A — no doc change needed.

## Security

- [ ] No weakening of authentication, authorization, validation, input sanitization, rate limiting, password handling, or token handling.
- [ ] No secrets, keys, or real credentials added to the repo or to committed `.env*` files.

## Verification

CI runs typecheck + lint + tests for both packages (plus the frontend build). Say what you did **beyond** that:

- [ ] Added or updated tests covering the change (especially regression tests for bug fixes).
- [ ] Verified against the real database and/or a real browser session where relevant.
- [ ] Any temporary test fixtures created during verification were cleaned up.

<!-- Notes on what you verified and how: -->

## Follow-ups

<!-- Anything deliberately left out of this PR, and where it's logged. -->
