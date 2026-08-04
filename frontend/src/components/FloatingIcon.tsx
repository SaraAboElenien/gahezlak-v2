import type { LucideIcon } from "lucide-react";
import React from "react";

interface FloatingIconProps {
  icon: LucideIcon;
  delay: number;
  position: string;
}

export const FloatingIcon: React.FC<FloatingIconProps> = ({
  icon: Icon,
  delay,
  position,
}) => {
  return (
    <div
      className={`absolute ${position} animate-float`}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: "3s",
      }}
    >
      <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-xl border border-white/30 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110">
        <Icon className="w-8 h-8 text-lighter-primary/10" />
      </div>
    </div>
  );
};
