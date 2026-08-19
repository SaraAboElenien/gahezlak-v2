import { useState } from "react";
import { AxiosError } from "axios";
import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useEnrichShopMenu } from "@/hooks/usePublicShopData";
import type { EnrichSummaryResponse } from "@/types/menuItem";

/**
 * Runs AI enrichment over the shop's menu and reports what happened.
 *
 * Why this exists as an explicit, manual action rather than something that
 * happens when a menu item is saved: every item is one paid API call. Running
 * it on every edit would bill the account for typo fixes, so the shop decides
 * when to spend.
 *
 * Why it exists *at all*: the customer-facing AI search filters on the data
 * this produces, and an unenriched item is deliberately treated as unsafe
 * rather than safe. Until this has run, an allergy search returns nothing —
 * which reads to a customer as a broken feature, not an empty result.
 */
const MenuEnrichSection = () => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<EnrichSummaryResponse["data"] | null>(
    null,
  );
  const { mutateAsync: enrich, isPending } = useEnrichShopMenu();

  const run = async (force: boolean) => {
    setSummary(null);
    try {
      const response = await enrich(force);
      setSummary(response.data);
      if (response.data.processed > 0) {
        toast.success(
          t("menu.enrichSuccess", {
            count: response.data.processed,
            defaultValue: `Analysed ${response.data.processed} menu items.`,
          }),
        );
      } else if (response.data.skipped > 0 && response.data.failed === 0) {
        toast.success(
          t("menu.enrichNothingToDo", {
            defaultValue: "Every menu item has already been analysed.",
          }),
        );
      }
    } catch (err) {
      // Matches the app-wide pattern: a network-level failure has no
      // `err.response`, so reading `.data.message` off it directly would throw
      // inside the catch and swallow the error silently.
      const message =
        err instanceof AxiosError
          ? (err.response?.data?.message ?? err.message)
          : err instanceof Error
            ? err.message
            : t("common.errors.generic");
      toast.error(message);
    }
  };

  return (
    <div className="bg-white dark:bg-card rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-primary to-darker-primary rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t("menu.enrichTitle", {
                defaultValue: "Allergen & dietary analysis",
              })}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
              {t("menu.enrichDescription", {
                defaultValue:
                  "Analyse every dish for allergens, ingredients and dietary tags so customers can search your menu by their restrictions. Run this after adding or editing items — dishes that have not been analysed are hidden from allergy searches.",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-darker-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {isPending
                ? t("menu.enrichRunning", { defaultValue: "Analysing…" })
                : t("menu.enrichRun", { defaultValue: "Analyse menu" })}
            </span>
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={isPending}
            title={t("menu.enrichForceHint", {
              defaultValue:
                "Re-analyse every dish, including ones already done. Use after editing descriptions.",
            })}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {t("menu.enrichForce", { defaultValue: "Re-analyse all" })}
          </button>
        </div>
      </div>

      {/* A long menu is one API call per dish, run one at a time, so this is
          slow enough that silence looks like a hang. */}
      {isPending && (
        <p
          className="mt-4 text-sm text-gray-500 dark:text-gray-400"
          role="status"
        >
          {t("menu.enrichPatience", {
            defaultValue:
              "This analyses one dish at a time and can take a minute or two on a large menu. Leave this page open.",
          })}
        </p>
      )}

      {summary && !isPending && (
        <div
          className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
          role="status"
        >
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {t("menu.enrichProcessed", {
                count: summary.processed,
                defaultValue: `${summary.processed} analysed`,
              })}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {t("menu.enrichSkipped", {
                count: summary.skipped,
                defaultValue: `${summary.skipped} already done`,
              })}
            </span>
            {summary.failed > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
                {t("menu.enrichFailed", {
                  count: summary.failed,
                  defaultValue: `${summary.failed} failed`,
                })}
              </span>
            )}
          </div>

          {/* Per-item reasons, not just a count: a run that fails on three
              dishes out of forty is worth retrying for those three, and the
              message says whether that is even possible. */}
          {summary.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400 max-h-40 overflow-y-auto">
              {summary.errors.map((e) => (
                <li key={e.menuItemId}>{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default MenuEnrichSection;
