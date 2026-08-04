import { useState } from "react";
import CategoryModal from "./CategoryModal";
import ItemModal from "./ItemModal";
import type { OcrData } from "@/types/menuOcr";

interface OcrDataHandlerProps {
  ocrData: OcrData | null;
  onComplete: () => void;
}

const OcrDataHandler = ({ ocrData, onComplete }: OcrDataHandlerProps) => {
  const [currentStep, setCurrentStep] = useState<
    "categories" | "items" | "complete"
  >("categories");
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Process categories first
  const categoriesToProcess = ocrData?.categories;
  const itemsToProcess = ocrData?.items;

  const handleCategorySubmit = () => {
    if (categoriesToProcess && currentIndex < categoriesToProcess.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentStep("items");
      setCurrentIndex(0);
    }
  };

  const handleItemSubmit = () => {
    if (itemsToProcess && currentIndex < itemsToProcess.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentStep("complete");
      onComplete();
    }
  };

  const handleSkip = () => {
    if (currentStep === "categories") {
      if (
        categoriesToProcess &&
        currentIndex < categoriesToProcess.length - 1
      ) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setCurrentStep("items");
        setCurrentIndex(0);
      }
    } else {
      if (itemsToProcess && currentIndex < itemsToProcess.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setCurrentStep("complete");
        onComplete();
      }
    }
  };

  return (
    <>
      {currentStep === "categories" && categoriesToProcess && (
        <CategoryModal
          isOpen={true}
          onClose={() => {}} // Disable closing
          editingCategory={{ _id: "", ...categoriesToProcess[currentIndex] }}
          ocrSubmit={handleCategorySubmit}
          onSkip={handleSkip}
          isOcr={true}
          showCloseButton={false}
        />
      )}

      {currentStep === "items" && itemsToProcess && (
        <ItemModal
          isOpen={true}
          onClose={() => {}} // Disable closing
          editingItem={{
            _id: "",
            imgUrl: "",
            categoryId: "",
            ...itemsToProcess[currentIndex],
          }}
          ocrSubmit={handleItemSubmit}
          onSkip={handleSkip}
          isOcr={true}
          showCloseButton={false}
        />
      )}
    </>
  );
};

export default OcrDataHandler;
