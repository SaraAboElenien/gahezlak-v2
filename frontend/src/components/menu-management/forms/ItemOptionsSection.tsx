import React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import InputField from "@/components/InputField";
import type { ItemOption, OptionChoice } from "@/types/menuItem";
import type { MenuItemFormInputs } from "@/types/validations/menu/items";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

interface ItemOptionsSectionProps {
  options: ItemOption[];
  setOptions: React.Dispatch<React.SetStateAction<ItemOption[]>>;
  isLoading?: boolean;
  register: UseFormRegister<MenuItemFormInputs>;
  errors?: FieldErrors<MenuItemFormInputs>;
}

const ItemOptionsSection: React.FC<ItemOptionsSectionProps> = ({
  options,
  setOptions,
  register,
  errors,
  isLoading = false,
}) => {
  const { t } = useTranslation();

  // Options management functions
  const addOption = () => {
    const newOption: ItemOption = {
      _id: Date.now().toString(),
      name: { en: "", ar: "" },
      type: "single",
      required: false,
      choices: [
        {
          _id: Date.now().toString() + "-choice",
          name: { en: "", ar: "" },
          price: 0,
        },
      ],
    };
    setOptions([...options, newOption]);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const addChoice = (optionIndex: number) => {
    const newChoice: OptionChoice = {
      _id: Date.now().toString(),
      name: { en: "", ar: "" },
      price: 0,
    };
    const updatedOptions = [...options];
    updatedOptions[optionIndex].choices.push(newChoice);
    setOptions(updatedOptions);
  };

  const removeChoice = (optionIndex: number, choiceIndex: number) => {
    const updatedOptions = [...options];
    // Check if this is the last choice in the option
    if (updatedOptions[optionIndex].choices.length === 1) {
      // Remove the entire option if it's the last choice
      updatedOptions.splice(optionIndex, 1);
    } else {
      // Otherwise just remove the specific choice
      updatedOptions[optionIndex].choices.splice(choiceIndex, 1);
    }
    setOptions(updatedOptions);
  };

  return (
    <div className="card-background p-6 rounded-xl border border-border shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
          <div className="w-1 h-6 bg-muted-foreground rounded-full"></div>
          {t("menu.items.form.optionsSection")}
        </h3>
        {/* add option button */}
        <button
          type="button"
          onClick={addOption}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg 
                    hover:bg-primary hover:text-primary-foreground transition-all duration-200
                    font-medium text-sm focus:ring-2 focus:ring-primary focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t("menu.items.form.addOption")}
        </button>
      </div>

      {options.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("menu.items.form.noOptions")}
        </div>
      ) : (
        <div className="space-y-6">
          {options.map((option, optionIndex) => (
            <div
              key={optionIndex}
              className="border border-border rounded-lg p-4 bg-muted/30"
            >
              <div className="flex justify-between items-start mb-4">
                {/* option Name */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField
                    label={`${t("menu.items.form.optionName")} (English)`}
                    id={`options.${optionIndex}.name.en`}
                    type="text"
                    register={register(`options.${optionIndex}.name.en`)}
                    error={errors?.options?.[optionIndex]?.name?.en}
                    errorMessage={
                      errors?.options?.[optionIndex]?.name?.en?.message
                    }
                  />
                  <InputField
                    label={`${t("menu.items.form.optionName")} (Arabic)`}
                    id={`options.${optionIndex}.name.ar`}
                    type="text"
                    register={register(`options.${optionIndex}.name.ar`)}
                    error={errors?.options?.[optionIndex]?.name?.ar}
                    errorMessage={
                      errors?.options?.[optionIndex]?.name?.ar?.message
                    }
                  />
                </div>
                {/* delete option btn */}
                <button
                  type="button"
                  onClick={() => removeOption(optionIndex)}
                  disabled={isLoading}
                  className="ml-4 text-destructive hover:text-destructive/80 
                                    hover:bg-destructive/10 p-1 rounded-md transition-all duration-200
                                    cursor-pointer z-10"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-4">
                {/* option type & required */}
                <div className="mt-5">
                  <label className="label">
                    {t("menu.items.form.optionType")}
                  </label>
                  <select
                    {...register(`options.${optionIndex}.type`)}
                    className="select select-bordered w-full"
                    disabled={isLoading}
                  >
                    <option value="single">
                      {t("menu.items.form.single")}
                    </option>
                    <option value="multiple">
                      {t("menu.items.form.multiple")}
                    </option>
                  </select>
                </div>
                <div className="flex items-center h-[52px] ms-auto">
                  <input
                    type="checkbox"
                    id={`required-${optionIndex}`}
                    {...register(`options.${optionIndex}.required`)}
                    className="checkbox checkbox-success"
                    disabled={isLoading}
                  />
                  <label
                    htmlFor={`required-${optionIndex}`}
                    className="label ml-2"
                  >
                    {t("menu.items.form.optionRequired")}
                  </label>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="label">
                    {t("menu.items.form.optionChoices")}
                  </h4>
                  {/* add choice btn */}
                  <button
                    type="button"
                    onClick={() => addChoice(optionIndex)}
                    disabled={isLoading}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 text-sm
                              font-medium transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {t("menu.items.form.addChoice")}
                  </button>
                </div>

                {option.choices.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    {t("menu.items.form.noChoices")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {option.choices.map((_, choiceIndex) => (
                      <div
                        key={choiceIndex}
                        className="relative bg-background/50 p-3 rounded-lg border border-border/50"
                      >
                        {/* Remove choice button */}
                        <button
                          type="button"
                          onClick={() => removeChoice(optionIndex, choiceIndex)}
                          disabled={isLoading}
                          className="absolute top-2 right-2 text-destructive hover:text-destructive/80 
                                    hover:bg-destructive/10 p-1 rounded-md transition-all duration-200
                                    cursor-pointer z-10"
                          title={t("menu.items.form.removeChoice")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-1 gap-3 pr-8">
                          {/* choices name */}
                          <InputField
                            label={`${t(
                              "menu.items.form.choiceName",
                            )} (English)`}
                            id={`options.${optionIndex}.choices.${choiceIndex}.name.en`}
                            type="text"
                            register={register(
                              `options.${optionIndex}.choices.${choiceIndex}.name.en`,
                            )}
                            error={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.name?.en
                            }
                            errorMessage={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.name?.en?.message
                            }
                          />
                          <InputField
                            label={`${t(
                              "menu.items.form.choiceName",
                            )} (Arabic)`}
                            id={`options.${optionIndex}.choices.${choiceIndex}.name.ar`}
                            type="text"
                            register={register(
                              `options.${optionIndex}.choices.${choiceIndex}.name.ar`,
                            )}
                            error={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.name?.ar
                            }
                            errorMessage={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.name?.ar?.message
                            }
                          />
                          {/* choice price */}
                          <InputField
                            label={t("menu.items.form.choicePrice")}
                            id={`options.${optionIndex}.choices.${choiceIndex}.price`}
                            register={register(
                              `options.${optionIndex}.choices.${choiceIndex}.price`,
                              {
                                valueAsNumber: true,
                              },
                            )}
                            error={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.price
                            }
                            errorMessage={
                              errors?.options?.[optionIndex]?.choices?.[
                                choiceIndex
                              ]?.price?.message
                            }
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ItemOptionsSection;
