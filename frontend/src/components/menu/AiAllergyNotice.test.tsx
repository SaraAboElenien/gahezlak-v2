import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AiAllergyNotice from "./AiAllergyNotice";

/**
 * The AI menu search is the one customer-facing screen where a wrong answer
 * can hurt someone: it decides whether a nut-allergic diner is shown a dish
 * containing pesto. Enrichment runs on a language model, so the data can be
 * incomplete or wrong — proven in practice, where two runs over the same menu
 * disagreed about whether a pesto wrap contained tree nuts.
 *
 * These tests pin the two things the notice has to keep saying. They are
 * cheap, and the failure they guard against is a well-meant copy edit that
 * removes the actionable half of a safety warning.
 */
describe("AiAllergyNotice", () => {
  it("tells the customer to confirm allergies with the restaurant", () => {
    render(<AiAllergyNotice currentLang="en" hiddenCount={0} />);

    // Saying the data may be wrong is not enough on its own — the customer
    // needs to be told what to do about it. The copy this replaced ("Results
    // may not be 100% accurate") had the hedge and not the instruction.
    expect(screen.getByRole("note")).toHaveTextContent(/AI-generated/i);
    expect(screen.getByRole("note")).toHaveTextContent(
      /confirm any food allergy with the restaurant/i,
    );
  });

  it("explains hidden dishes as missing data, not as unsafe dishes", () => {
    render(<AiAllergyNotice currentLang="en" hiddenCount={7} />);

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/7 dishes are hidden/i);
    // The distinction that matters: search treats an un-analysed item as
    // unsafe, so on an unanalysed menu every dish is hidden. Without this the
    // customer reads an empty result as "nothing here for me".
    expect(note).toHaveTextContent(/don't have enough information/i);
    expect(note).toHaveTextContent(/doesn't necessarily mean they are unsafe/i);
  });

  it("says nothing about hidden dishes when none were hidden", () => {
    render(<AiAllergyNotice currentLang="en" hiddenCount={0} />);

    expect(screen.getByRole("note")).not.toHaveTextContent(/hidden/i);
  });

  it("uses the singular when exactly one dish is hidden", () => {
    render(<AiAllergyNotice currentLang="en" hiddenCount={1} />);

    expect(screen.getByRole("note")).toHaveTextContent(/1 dish is hidden/i);
  });

  it("renders Arabic copy right-to-left", () => {
    render(<AiAllergyNotice currentLang="ar" hiddenCount={3} />);

    const note = screen.getByRole("note");
    // The app is bilingual and this is a safety notice — an English-only
    // warning is no warning for half the users.
    expect(note).toHaveAttribute("dir", "rtl");
    expect(note).toHaveTextContent(/الذكاء الاصطناعي/);
    expect(note).toHaveTextContent(/تأكيد أي حساسية غذائية مع المطعم/);
    expect(note).toHaveTextContent(/3/);
  });
});
