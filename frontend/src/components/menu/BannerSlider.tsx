import { useState } from "react";
import { useKeenSlider } from "keen-slider/react";
import "keen-slider/keen-slider.min.css";
import type { MenuItem as ApiMenuItem } from "@/types/menuItem";
import { useLang } from "@/hooks/useLang";
import { calculateDiscountedPrice } from "@/utils/priceCalculations";

interface MenuItems {
  menuItems: ApiMenuItem[];
}

export default function BannerSlider({ menuItems }: MenuItems) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { currentLang } = useLang();

  const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
    loop: true,
    slideChanged(slider) {
      setCurrentSlide(slider.track.details.rel);
    },
  });

  // Add early return if no menuItems
  if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
    return null; // or return a placeholder/loading state
  }
  return (
    <div className="relative h-64 bg-gradient-to-r from-menu-primary to-menu-secondary rounded-lg overflow-hidden mb-6 shadow-md">
      <div ref={sliderRef} className="keen-slider h-full">
        {menuItems.map((item) => (
          <div key={item._id} className="keen-slider__slide flex h-full">
            <div className="flex-1 p-6 flex flex-col justify-center text-white">
              <h3 className="text-2xl font-bold mb-2">
                {item.name[currentLang as "en" | "ar"]}
              </h3>
              <p className="text-sm opacity-90 mb-4">
                {item.description[currentLang as "en" | "ar"]}
              </p>
            </div>

            <div className="w-2/5 h-full relative">
              <img
                src={item.imgUrl}
                alt={item.name[currentLang as "en" | "ar"]}
                className="w-full h-full object-cover"
              />
              {/* Price Badge */}
              <div className="absolute top-4 right-4 bg-white bg-opacity-90 px-3 py-1 rounded-full">
                <span className="text-primary font-bold">
                  {item.discountPercentage && item.discountPercentage > 0
                    ? `${calculateDiscountedPrice(item)?.toFixed(2)} EGP`
                    : `${item.price} EGP`}
                </span>
              </div>

              {/* Discount Badge */}
              {item.discountPercentage && item.discountPercentage > 0 && (
                <div className="absolute top-4 left-4 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold">
                  -{item.discountPercentage}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Arrows */}
      {/* <button
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full p-2 transition-all"
      >
        <ChevronLeft className="h-4 w-4 text-black" />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full p-2 transition-all"
      >
        <ChevronRight className="h-4 w-4 text-black" />
      </button> */}

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
        {menuItems.map((_, index) => (
          <button
            key={index}
            onClick={() => instanceRef.current?.moveToIdx(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentSlide ? "bg-white" : "bg-white bg-opacity-50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
