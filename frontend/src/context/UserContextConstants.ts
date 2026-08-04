import { createContext } from "react";
import type { UserProfile } from "../types/user";

type UserContextType = {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => void;
  setUser: (user: UserProfile | null) => void;
  handleLogout: () => void;
  isLoggingOut: boolean;
};

export const UserContext = createContext<UserContextType | undefined>(
  undefined,
);
