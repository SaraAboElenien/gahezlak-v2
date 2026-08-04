import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Close({ to = "/" }: { to?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="absolute top-5 right-5 z-20 text-gray-800 cursor-pointer hover:scale-95 p-2 bg-white rounded duration-200 "
    >
      <X className="w-5 h-5" />
    </button>
  );
}
