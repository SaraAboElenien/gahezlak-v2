import { useMenuItem } from "@/hooks/useOrder";

type Props = {
  itemId: string;
  quantity: number;
};

const MenuItemDetails = ({ itemId, quantity }: Props) => {
  const { data, isLoading } = useMenuItem(itemId);

  if (isLoading) return <li>Loading item...</li>;
  if (!data) return <li>Item not found</li>;
  const items = data.data;

  return (
    <li className="flex justify-between font-bold">
      <span>{items.name.ar}</span> × <span>{quantity}</span> —{" "}
      <span>{items.price} EGP</span>
    </li>
  );
};

export default MenuItemDetails;
