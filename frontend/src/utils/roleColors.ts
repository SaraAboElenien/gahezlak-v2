// utils/roleColors.ts

export interface RoleColorPalette {
  bg: string;
  text: string;
  border: string;
  hover: string;
}

/**
 * Predefined color palettes for roles with good contrast and dark mode support
 */
const COLOR_PALETTES: RoleColorPalette[] = [
  {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-700",
    hover: "hover:bg-blue-200 dark:hover:bg-blue-800/40",
  },
  {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-700",
    hover: "hover:bg-emerald-200 dark:hover:bg-emerald-800/40",
  },
  {
    bg: "bg-teal-100 dark:bg-teal-900/30",
    text: "text-teal-800 dark:text-teal-300",
    border: "border-teal-200 dark:border-teal-700",
    hover: "hover:bg-teal-200 dark:hover:bg-teal-800/40",
  },
  {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-700",
    hover: "hover:bg-orange-200 dark:hover:bg-orange-800/40",
  },
  {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-800 dark:text-purple-300",
    border: "border-purple-200 dark:border-purple-700",
    hover: "hover:bg-purple-200 dark:hover:bg-purple-800/40",
  },
  {
    bg: "bg-pink-100 dark:bg-pink-900/30",
    text: "text-pink-800 dark:text-pink-300",
    border: "border-pink-200 dark:border-pink-700",
    hover: "hover:bg-pink-200 dark:hover:bg-pink-800/40",
  },
  {
    bg: "bg-indigo-100 dark:bg-indigo-900/30",
    text: "text-indigo-800 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-700",
    hover: "hover:bg-indigo-200 dark:hover:bg-indigo-800/40",
  },
  {
    bg: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-700",
    hover: "hover:bg-rose-200 dark:hover:bg-rose-800/40",
  },
  {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-700",
    hover: "hover:bg-amber-200 dark:hover:bg-amber-800/40",
  },
  {
    bg: "bg-cyan-100 dark:bg-cyan-900/30",
    text: "text-cyan-800 dark:text-cyan-300",
    border: "border-cyan-200 dark:border-cyan-700",
    hover: "hover:bg-cyan-200 dark:hover:bg-cyan-800/40",
  },
];

export const createStringHash = (str: string): number => {
  let hash = 0;
  if (str.length === 0) return hash;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
};

export const generateRoleColors = (roleName: string): RoleColorPalette => {
  if (!roleName || typeof roleName !== "string") {
    // Return a default color palette for invalid input
    return COLOR_PALETTES[0];
  }

  const hash = createStringHash(roleName.toLowerCase().trim());
  const paletteIndex = hash % COLOR_PALETTES.length;

  return COLOR_PALETTES[paletteIndex];
};

export const getAllColorPalettes = (): RoleColorPalette[] => {
  return [...COLOR_PALETTES];
};

export const generateRoleBadgeClass = (
  roleName: string,
  variant: "default" | "outline" | "solid" = "default",
): string => {
  const colors = generateRoleColors(roleName);

  const baseClasses =
    "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium shadow-sm transition-all duration-200";

  switch (variant) {
    case "outline":
      return `${baseClasses} bg-transparent ${colors.text} border-2 ${colors.border} ${colors.hover}`;
    case "solid":
      return `${baseClasses} ${colors.bg} ${colors.text} border ${colors.border}`;
    default:
      return `${baseClasses} ${colors.bg} ${colors.text} border ${colors.border} ${colors.hover}`;
  }
};
