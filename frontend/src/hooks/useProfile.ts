import { UserContext } from "@/context/UserContextConstants";
import { useContext } from "react";

export const useProfile = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
};
