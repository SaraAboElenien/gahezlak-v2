import axios from "axios";
import { BASE_URL } from "@/config/api";
import { beginApiRequest } from "./apiActivity";

const REFRESH_ENDPOINT = "/auth/refresh";

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  // Required for the httpOnly refresh-token cookie the backend sets on
  // login/verify-code/refresh — without this the browser neither sends nor
  // stores it on cross-origin requests.
  withCredentials: true,
});

/**
 * The access token lives in memory only — never in localStorage, where any
 * XSS payload could read it. The trade-off is that it's gone on reload, which
 * is why the app performs a silent refresh at boot (see UserContext): the
 * refresh token is an httpOnly cookie the browser replays for us, and JS
 * can't read it at all.
 */
let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;

export const setAccessToken = (token: string): void => {
  accessToken = token;
};

export const clearAccessToken = (): void => {
  accessToken = null;
};

/**
 * Request-duration tracking for the cold-start wake-up notice (see
 * `apiActivity.ts`). Keyed off the request config object by WeakMap rather
 * than a property on it, so nothing about the request that goes over the wire
 * changes and there is nothing to clean up if a request is abandoned.
 */
const activityTrackers = new WeakMap<object, () => void>();

function startTracking(config: object): void {
  // The 401 path re-issues the *same* config object through this interceptor.
  // Without ending the previous attempt first, that request would stay counted
  // as in-flight forever and the notice would never disappear.
  activityTrackers.get(config)?.();
  activityTrackers.set(config, beginApiRequest());
}

function stopTracking(config: object | undefined): void {
  if (!config) return;
  const end = activityTrackers.get(config);
  if (!end) return;
  activityTrackers.delete(config);
  end();
}

// Attach access token to every request
axiosInstance.interceptors.request.use(
  (config) => {
    startTracking(config);
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Single shared refresh implementation, used by the 401-retry interceptor
// below, the boot-time rehydration in UserContext, and any flow (e.g. shop
// creation) that needs to refresh the token after an action changes the JWT's
// claims. Deliberately uses a plain axios call (not axiosInstance) so this
// request never itself goes through these interceptors, which would risk
// recursive refresh attempts.
// A single in-flight promise is shared so concurrent 401s only trigger one
// network call instead of one per failed request.
let refreshPromise: Promise<string | null> | null = null;

export const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // Tracked by hand because this is a bare axios call, on purpose (see
      // above). It is also usually the *first* request a returning visitor
      // makes, so it is the one that discovers a sleeping backend.
      const endTracking = beginApiRequest();
      try {
        // No body: the refresh token travels as the httpOnly cookie, which
        // only rides along because of `withCredentials`.
        const res = await axios.post(
          `${BASE_URL}${REFRESH_ENDPOINT}`,
          {},
          { withCredentials: true },
        );
        const newAccessToken = res.data.data.accessToken as string;
        setAccessToken(newAccessToken);
        return newAccessToken;
      } catch {
        // No valid session left (missing/expired/already-rotated cookie).
        clearAccessToken();
        return null;
      } finally {
        endTracking();
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

// Handle 401 errors and refresh token
axiosInstance.interceptors.response.use(
  (response) => {
    stopTracking(response.config);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Ended before anything else: the retry below re-enters the request
    // interceptor and starts a fresh measurement of its own.
    stopTracking(originalRequest);

    // The refresh token is an httpOnly cookie now, so there is nothing to
    // check up front — we just attempt the refresh and treat a failure as
    // "no session". Two guards keep that from looping: `_retry` (one attempt
    // per request) and skipping the refresh endpoint itself, which in any
    // case is issued through bare axios and so never reaches this handler.
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes(REFRESH_ENDPOINT)
    ) {
      originalRequest._retry = true;

      // Captured before the refresh clears it: only a user who actually had
      // a session gets bounced to the login page. An anonymous visitor on a
      // public menu page must not be redirected away by a stray 401.
      const hadSession = getAccessToken() !== null;

      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      }

      // Refresh failed — force logout
      if (hadSession) {
        window.location.href = "/auth";
      }
    }

    return Promise.reject(error);
  },
);
