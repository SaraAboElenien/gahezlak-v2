import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { userApi } from "../services/userApi";
import type { UserProfile } from "../types/user";
import { UserContext } from "./UserContextConstants";
import { useSignout } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
} from "@/services/axiosInint";

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `loading` stays true for the whole bootstrap — including the silent
  // refresh below — so route guards render a loader instead of concluding
  // "logged out" and redirecting to /auth mid-flight.
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The access token is memory-only, so a hard reload always starts with
      // none. Before deciding the user is logged out, try to re-establish the
      // session from the httpOnly refresh cookie — that silent refresh is the
      // only thing that survives a reload now.
      const token = getAccessToken() ?? (await refreshAccessToken());
      if (!token) {
        setUser(null);
        return;
      }

      const response = await userApi.GetUser();
      setUser(response.data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load profile");
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const { mutate: signout, isPending: isLoggingOut } = useSignout();

  const handleLogout = useCallback(() => {
    signout(undefined, {
      onSuccess: () => {
        // The server has cleared the refresh cookie; drop the in-memory
        // access token so nothing is left to authenticate with.
        clearAccessToken();
        toast.success("Logged out successfully");
        setUser(null);
      },
      onError: (error: unknown) => {
        if (error instanceof AxiosError) {
          console.error(
            "Logout failed:",
            error.response?.data?.message || error.message || "Unknown error",
          );
        } else if (error instanceof Error) {
          console.error("Logout failed:", error.message);
        } else {
          console.error("Logout failed:", "Unknown error");
        }
      },
    });
  }, [signout]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      refreshProfile: fetchProfile,
      setUser,
      handleLogout,
      isLoggingOut,
    }),
    [user, loading, error, fetchProfile, handleLogout, isLoggingOut],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
