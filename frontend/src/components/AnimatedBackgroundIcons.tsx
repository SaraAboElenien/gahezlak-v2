import {
  ChefHat,
  Coffee,
  QrCode,
  ShoppingCart,
  Smartphone,
  Star,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { FloatingIcon } from "./FloatingIcon";

export default function AnimatedBackgroundIcons() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r  from-emerald-600/20 via-purple-400/20 to-green-400/20 animate-pulse"></div>
      {/* Floating Icons */}
      <FloatingIcon icon={QrCode} delay={0} position="top-20 left-10" />
      <FloatingIcon icon={Coffee} delay={0.5} position="top-40 right-20" />
      <FloatingIcon
        icon={UtensilsCrossed}
        delay={1}
        position="top-60 left-1/4"
      />
      <FloatingIcon icon={Users} delay={1.5} position="top-32 right-1/3" />
      <FloatingIcon icon={Smartphone} delay={2} position="top-80 right-10" />
      <FloatingIcon icon={Star} delay={2.5} position="top-96 left-20" />
      <FloatingIcon icon={ChefHat} delay={3} position="top-52 right-1/4" />
      <FloatingIcon
        icon={ShoppingCart}
        delay={3.5}
        position="top-72 left-1/3"
      />
    </>
  );
}
