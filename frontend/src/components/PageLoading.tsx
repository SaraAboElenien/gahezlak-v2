import { useApiWakeUp } from "@/hooks/useApiWakeUp";
import ServerWakingNotice from "./ServerWakingNotice";

interface PageLoadingProps {
  /** Optional caption for the ordinary, fast case. */
  label?: string;
  /** Extra classes on the centring wrapper (e.g. `min-h-screen`). */
  className?: string;
}

/**
 * The app's loading state, with one extra behaviour: if an API request is
 * still outstanding after `useApiWakeUp`'s threshold, the spinner gives way to
 * an explanation of the free-tier cold start (see `ServerWakingNotice`).
 *
 * One component rather than a copy in each page, so a page picks up the
 * wake-up handling by using its normal loading state — and so the threshold
 * and the copy stay in one place.
 */
export default function PageLoading({
  label,
  className = "",
}: PageLoadingProps) {
  const { isWaking, elapsedMs, estimatedMs } = useApiWakeUp();

  return (
    <div className={`flex items-center justify-center px-4 py-10 ${className}`}>
      {isWaking ? (
        <ServerWakingNotice elapsedMs={elapsedMs} estimatedMs={estimatedMs} />
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          {label && <p className="text-gray-600 dark:text-gray-400">{label}</p>}
        </div>
      )}
    </div>
  );
}
