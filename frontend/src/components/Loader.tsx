import { useApiWakeUp } from "@/hooks/useApiWakeUp";
import ServerWakingNotice from "./ServerWakingNotice";

/**
 * The app-wide loader: the `<Suspense>` fallback for every code-split route
 * and the holding state every route guard renders while the profile bootstrap
 * runs.
 *
 * It escalates to `ServerWakingNotice` once an API request has been
 * outstanding past the threshold, which is what covers the login/landing path
 * during a Render free-tier cold start. Chunk loading alone never triggers it:
 * the wake-up state is driven by in-flight *API* requests, not by this
 * component being mounted.
 */
export default function Loader() {
  const { isWaking, elapsedMs, estimatedMs } = useApiWakeUp();

  return (
    <div className="mx-auto p-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
      {isWaking ? (
        <ServerWakingNotice elapsedMs={elapsedMs} estimatedMs={estimatedMs} />
      ) : (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}
