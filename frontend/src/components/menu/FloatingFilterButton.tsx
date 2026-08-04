import React from "react";
import { Filter } from "lucide-react";

interface FloatingFilterButtonProps {
  isVisible: boolean;
  onClick: () => void;
}

const FloatingFilterButton: React.FC<FloatingFilterButtonProps> = ({
  isVisible,
  onClick,
}) => {
  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed left-4 bottom-20 z-40 bg-primary text-white p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all duration-300 animate-bounce"
    >
      <Filter className="h-6 w-6" />
    </button>
  );
};

export default FloatingFilterButton;
