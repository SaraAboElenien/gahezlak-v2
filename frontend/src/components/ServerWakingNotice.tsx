import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLang } from "@/hooks/useLang";

interface ServerWakingNoticeProps {
  /** How long the outstanding API request has been running. */
  elapsedMs: number;
  /** The cold-start estimate, used for the progress bar and the counter. */
  estimatedMs: number;
}

/**
 * The honest version of "loading…" for a Render free-tier cold start.
 *
 * The demo API sleeps after ~15 minutes idle and takes ~50 seconds to wake. A
 * bare spinner for 50 seconds reads as broken, and a portfolio visitor who
 * concludes the site is broken leaves — so this says what is actually
 * happening, how long it will take, and that it is a one-off. Naming the cause
 * turns a defect into a disclosed hosting trade-off.
 *
 * Deliberately never rendered on its own: `useApiWakeUp` only reports `true`
 * after a threshold well past a healthy response time, so an ordinary load
 * never sees this.
 */
export default function ServerWakingNotice({
  elapsedMs,
  estimatedMs,
}: ServerWakingNoticeProps) {
  const { t } = useTranslation();
  const { currentLang } = useLang();
  const isAr = currentLang === "ar";

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const estimatedSeconds = Math.round(estimatedMs / 1000);
  // Capped short of full: a bar that sits at 100% while nothing happens reads
  // as hung, which is the exact impression this component exists to avoid.
  const percent = Math.min(95, Math.round((elapsedMs / estimatedMs) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      dir={isAr ? "rtl" : "ltr"}
      className="mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-card"
    >
      <Loader2
        className="mx-auto mb-4 h-10 w-10 animate-spin text-primary"
        aria-hidden="true"
      />

      <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
        {t("serverWaking.title")}
      </h2>

      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {t("serverWaking.body")}
      </p>

      {/* The progress bar fills from the inline-start edge in both directions
          because the container carries `dir`, so RTL fills right-to-left. */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs font-medium text-primary">
        {t("serverWaking.progress", {
          elapsed: elapsedSeconds,
          estimated: estimatedSeconds,
        })}
      </p>

      <p className="mt-4 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
        {t("serverWaking.reassure")}
      </p>
    </div>
  );
}
