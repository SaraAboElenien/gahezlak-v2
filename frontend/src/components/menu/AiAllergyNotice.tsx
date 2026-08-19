import { ShieldAlert } from "lucide-react";

interface AiAllergyNoticeProps {
  /** "en" | "ar" — this page steers language by prop, not by t(). */
  currentLang: string;
  /**
   * Dishes the search excluded. Non-zero almost always means "we hold no
   * allergen data for these", not "these definitely contain the allergen" —
   * see the copy below.
   */
  hiddenCount: number;
}

/**
 * The disclaimer shown alongside AI menu-search results.
 *
 * This is the one screen in the app where a wrong answer can hurt someone, so
 * the notice says three specific things rather than a generic hedge:
 *
 * 1. The allergen data is model-generated, not supplied by the restaurant.
 * 2. Confirm with staff before ordering — the actionable instruction, which
 *    "results may not be 100% accurate" (what this replaces) never gave.
 * 3. What a hidden dish actually means. Search treats an un-analysed item as
 *    unsafe, so on a menu that has not been analysed *every* dish is hidden
 *    and the customer sees an empty result they would otherwise read as "this
 *    restaurant has nothing for me" rather than "we don't know yet".
 *
 * Deliberately styled as a warning rather than the 10px grey italic it
 * replaces: a disclaimer nobody reads protects nobody.
 */
/**
 * Arabic number agreement for "dish".
 *
 * Arabic does not have one plural: 1 and 2 have their own forms, 3–10 take the
 * plural (أصناف), and 11 upwards take the accusative singular (صنفًا). Writing
 * `${n} صنفًا` for every value — as this component first did — is wrong for
 * exactly the range a hidden-dish count usually falls in.
 */
function arabicDishCount(n: number): string {
  if (n === 1) return "صنف واحد";
  if (n === 2) return "صنفان";
  if (n >= 3 && n <= 10) return `${n} أصناف`;
  return `${n} صنفًا`;
}

const AiAllergyNotice = ({
  currentLang,
  hiddenCount,
}: AiAllergyNoticeProps) => {
  const isAr = currentLang === "ar";

  return (
    <div
      role="note"
      dir={isAr ? "rtl" : "ltr"}
      className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="text-xs leading-relaxed">
        <p>
          {isAr
            ? "معلومات الحساسية والمكوّنات مُولّدة بالذكاء الاصطناعي وقد تكون غير كاملة أو غير دقيقة. يُرجى تأكيد أي حساسية غذائية مع المطعم قبل الطلب."
            : "Allergen and ingredient information is AI-generated and may be incomplete or wrong. Please confirm any food allergy with the restaurant before ordering."}
        </p>
        {hiddenCount > 0 && (
          <p className="mt-1 opacity-90">
            {isAr
              ? `تم إخفاء ${arabicDishCount(hiddenCount)} لعدم توفر معلومات كافية للتأكد من أنها آمنة — وهذا لا يعني بالضرورة أنها غير آمنة. اسأل المطعم عنها.`
              : `${hiddenCount} ${hiddenCount === 1 ? "dish is" : "dishes are"} hidden because we don't have enough information to call ${hiddenCount === 1 ? "it" : "them"} safe — that doesn't necessarily mean ${hiddenCount === 1 ? "it is" : "they are"} unsafe. Ask the restaurant.`}
          </p>
        )}
      </div>
    </div>
  );
};

export default AiAllergyNotice;
