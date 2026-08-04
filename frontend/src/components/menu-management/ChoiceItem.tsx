import React from "react";
import { Trash2, DollarSign } from "lucide-react";
import { type OptionChoice } from "@/types/menuItem";

interface ChoiceItemProps {
  choice: OptionChoice;
  optionIndex: number;
  choiceIndex: number;
  currentLanguage: "en" | "ar";
  onUpdate: (
    optionIndex: number,
    choiceIndex: number,
    choice: OptionChoice,
  ) => void;
  onRemove: (optionIndex: number, choiceIndex: number) => void;
}

const ChoiceItem: React.FC<ChoiceItemProps> = ({
  choice,
  optionIndex,
  choiceIndex,
  currentLanguage,
  onUpdate,
  onRemove,
}) => {
  const handleNameChange = (lang: "en" | "ar", value: string) => {
    onUpdate(optionIndex, choiceIndex, {
      ...choice,
      name: { ...choice.name, [lang]: value },
    });
  };

  const handlePriceChange = (value: string) => {
    onUpdate(optionIndex, choiceIndex, {
      ...choice,
      price: parseFloat(value) || 0,
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mb-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {currentLanguage === "en" ? "Name (English)" : "الاسم (الإنجليزية)"}
        </label>
        <input
          type="text"
          value={choice.name.en}
          onChange={(e) => handleNameChange("en", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {currentLanguage === "en" ? "Name (Arabic)" : "الاسم (العربية)"}
        </label>
        <input
          type="text"
          value={choice.name.ar}
          onChange={(e) => handleNameChange("ar", e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          dir="rtl"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {currentLanguage === "en" ? "Price" : "السعر"}
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={choice.price}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <button
          onClick={() => onRemove(optionIndex, choiceIndex)}
          className="text-red-600 hover:text-red-800 h-[42px] flex items-center"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChoiceItem;
