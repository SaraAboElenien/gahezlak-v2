// components/IconBackground.tsx
import {
  Beef,
  BottleWine,
  ChefHat,
  Utensils,
  UtensilsCrossed,
  Fish,
  CookingPot,
  Hamburger,
} from "lucide-react";

const icons = [
  Beef,
  BottleWine,
  ChefHat,
  Utensils,
  UtensilsCrossed,
  Fish,
  CookingPot,
  Hamburger,
];

const iconPositions = [
  { top: "5%", left: "10%" },
  { top: "20%", left: "30%" },
  { top: "35%", left: "5%" },
  { top: "10%", left: "70%" },
  { top: "50%", left: "20%" },
  { top: "60%", left: "75%" },
  { top: "80%", left: "15%" },
  { top: "85%", left: "60%" },
  { top: "40%", left: "40%" },
  { top: "70%", left: "50%" },
  { top: "25%", left: "85%" },
  { top: "55%", left: "10%" },
  { top: "15%", left: "50%" },
  { top: "30%", left: "60%" },
  { top: "75%", left: "30%" },
  { top: "90%", left: "80%" },
  { top: "45%", left: "85%" },
  { top: "65%", left: "40%" },
  { top: "35%", left: "90%" },
  { top: "10%", left: "90%" },
];

export function BackgroundIcons() {
  return (
    <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
      {iconPositions.map((pos, i) => {
        const Icon = icons[i % icons.length];
        const size = 50 + (i % 4) * 10;
        return (
          <Icon
            key={i}
            className="ball-icon absolute text-gray-400"
            style={{
              top: pos.top,
              left: pos.left,
              width: `${size}px`,
              height: `${size}px`,
            }}
          />
        );
      })}
    </div>
  );
}
