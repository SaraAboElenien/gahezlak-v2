import { type JSX } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Globe, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router";
import { useLang } from "../hooks/useLang";
import { useProfile } from "@/hooks/useProfile";

export interface SidebarMenuItem {
  title: string;
  to: string;
  icon: React.ReactElement<LucideIcon>;
}

interface SidebarProps {
  /** Translation key shown in the sidebar header. */
  title: string;
  items: SidebarMenuItem[];
  onClose?: () => void;
  isOpen?: boolean; // Required for AnimatePresence
}

// Animation variants
const sidebarVariants = {
  open: { x: 0, opacity: 1 },
  closed: { x: "-100%", opacity: 0 },
};

const menuItemVariants = {
  hover: { scale: 1.02, transition: { duration: 0.2 } },
  active: { scale: 0.98, backgroundColor: "hsl(var(--p))" },
};

export default function Sidebar({
  title,
  items,
  onClose,
  isOpen = true, // Default to true for desktop
}: SidebarProps): JSX.Element {
  const { t } = useTranslation();
  const { toggleLanguage, currentLang } = useLang();
  const { handleLogout, isLoggingOut } = useProfile();
  const navigate = useNavigate();

  const handleCloseSidebar = (): void => {
    onClose?.();
  };

  const logout = () => {
    handleLogout();
    setTimeout(() => {
      navigate("/");
    }, 800);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="drawer-side"
          initial="closed"
          animate="open"
          exit="closed"
          variants={sidebarVariants}
          transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
        >
          <label
            htmlFor="my-drawer-2"
            aria-label="close sidebar"
            className="drawer-overlay"
            onClick={handleCloseSidebar}
          />

          <motion.aside
            className="bg-base-200 text-base-content min-h-full w-70 flex flex-col"
            layout // Smoothly animates layout changes
          >
            {/* Sidebar Header */}
            <motion.div
              className="p-4 border-b border-base-300"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-lg font-semibold text-center">{t(title)}</h2>
            </motion.div>

            {/* Navigation Menu */}
            <nav className="flex-1 p-4">
              <ul className="menu gap-2">
                {items.map((item) => (
                  <motion.li
                    key={item.title}
                    variants={menuItemVariants}
                    whileHover="hover"
                    whileTap="active"
                  >
                    <NavLink
                      to={item.to}
                      onClick={handleCloseSidebar}
                      className={({ isActive }: { isActive: boolean }) =>
                        `flex gap-3 px-4 py-3 rounded-lg transition-all duration-200 w-50 ${
                          isActive
                            ? "btn-gradient text-primary-content shadow-sm"
                            : "text-base-content hover:bg-base-300 hover:text-base-content"
                        }`
                      }
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="capitalize">{t(item.title)}</span>
                    </NavLink>
                  </motion.li>
                ))}
              </ul>
            </nav>

            {/* Footer Actions */}
            <motion.div
              className="p-4 border-t border-base-300 space-y-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* Language Toggle Button */}
              <motion.button
                onClick={toggleLanguage}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-base-300 hover:bg-base-100 text-base-content transition-all duration-200 group cursor-pointer"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <Globe className="h-5 w-5 group-hover:rotate-12 transition-transform duration-200" />
                <span className="flex-1 text-left">
                  {currentLang === "en" ? "العربية" : "English"}
                </span>
                <span className="text-xs opacity-60">
                  {currentLang === "en" ? "AR" : "EN"}
                </span>
              </motion.button>

              {/* Logout Button */}
              <motion.button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-error/10 hover:bg-error/20 text-error transition-all duration-200 group cursor-pointer"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={logout}
              >
                <LogOut className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
                <span className="flex-1 text-left font-medium">
                  {isLoggingOut ? t("logingout") : t("logout")}
                </span>
              </motion.button>
            </motion.div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
