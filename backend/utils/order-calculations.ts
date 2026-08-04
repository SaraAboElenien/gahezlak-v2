import { Types } from "mongoose";
import { Errors } from "../errors";
import { IMenuItem } from "../models/MenuItem";
import { IOrderItem } from "../models/Order";

export const calculateOrderTotalAmount = (orderItems: IOrderItem[]) => {
  return orderItems.reduce((acc, item) => {
    return acc + item.price * item.quantity;
  }, 0);
};

export function calculateItemPrice(
  menuItem: IMenuItem,
  selectedOptions: Array<{
    optionId: Types.ObjectId;
    choiceIds: Types.ObjectId[];
  }>,
): {
  finalPrice: number;
  validatedOptions: Array<{
    optionId: Types.ObjectId;
    choiceIds: Types.ObjectId[];
  }>;
} {
  let extraPrice = 0;
  const validOptions = menuItem.options || [];

  for (const option of validOptions) {
    if (option.required) {
      const isSelected = selectedOptions.some(
        (sel) => sel.optionId?.toString() === option._id?.toString(),
      );

      if (!isSelected) {
        throw new Errors.BadRequestError({
          en: `Required option '${option.name?.en}' not selected`,
          ar: `خيار مطلوب: ${option.name?.ar}`,
        });
      }
    }
  }

  for (const selectedOption of selectedOptions) {
    const option = validOptions.find(
      (opt) => opt._id?.toString() === selectedOption.optionId?.toString(),
    );

    if (!option) {
      throw new Errors.BadRequestError({
        en: "Invalid option selected",
        ar: "خيار غير صالح",
      });
    }

    for (const choiceId of selectedOption.choiceIds || []) {
      const choice = option.choices.find(
        (c) => c._id?.toString() === choiceId.toString(),
      );

      if (choice) {
        extraPrice += choice.price || 0;
      }
    }
  }

  const discount = (menuItem.price * (menuItem.discountPercentage || 0)) / 100;
  const finalPrice = menuItem.price - discount + extraPrice;
  return {
    finalPrice,
    validatedOptions: selectedOptions,
  };
}
