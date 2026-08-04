import React from "react";
import { useTranslation } from "react-i18next";

interface AvailabilityToggleSectionProps {
  isAvailable?: boolean;
  onChange: (checked: boolean) => void;
  isLoading?: boolean;
}

const AvailabilityToggleSection: React.FC<AvailabilityToggleSectionProps> = ({
  isAvailable = false,
  onChange,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <h3 className="text-lg font-semibold text-primary mb-4 flex items-center gap-2">
        <div className="w-1 h-6 bg-secondary rounded-full"></div>
        {t("menu.items.form.availabilitySection", "Availability Status")}
      </h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground mb-2">
              {isAvailable
                ? t("menu.items.form.visibleToCustomers")
                : t("menu.items.form.hiddenFromCustomers")}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => onChange(e.target.checked)}
              disabled={isLoading}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            <span className="ml-3 text-sm font-medium text-foreground">
              {isAvailable
                ? t("menu.items.form.active")
                : t("menu.items.form.inactive")}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityToggleSection;
