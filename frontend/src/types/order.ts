export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "InProgress"
  | "Preparing"
  | "Ready"
  | "Delivered"
  | "Cancelled";

export interface Order {
  _id: string;
  createdAt: string;
  updatedAt: string;
  orderNumber: number;
  orderStatus: OrderStatus;
  paymentMethod: string;
  tableNumber: number;
  totalAmount: number;
  customerFirstName: string;
  customerLastName: string;
  customerPhoneNumber: string;
  orderItems: OrderItem[];
  __v: number;
}

export interface OrderItem {
  _id: string;
  menuItem: MenuItem;
  price: number;
  quantity: number;
  discountPercentage: number;
  customizationDetails: string;
  selectedOptions: SelectedOption[];
}

export interface MenuItem {
  _id: string;
  name: LocalizedText;
  imgUrl: string;
  discountPercentage: number;
  options: MenuOption[];
}

export interface MenuOption {
  _id?: string;
  name?: LocalizedText;
  type?: string;
  required?: boolean;
  choices: OptionChoice[];
}

export interface OptionChoice {
  _id?: string;
  name?: LocalizedText;
  price?: number;
}

export interface SelectedOption {
  optionId: string;
  choiceIds: string[]; // Or change to `choice: OptionChoice` if you expand it fully
}

export interface LocalizedText {
  en: string;
  ar: string;
}
// export interface OrderItem {
//   menuItemId: string;
//   quantity: number;
//   price: number;
//   customizationDetails?: string;
// }

//!!!! Updated CREATE ORDER API RESPONSE
export interface CreateOrderResponse {
  message: string;
  data: {
    orderNumber: number;
    iframeUrl: string;
  };
}

// !!!!!! GET ORDER BY NUMBER API RESPONSE
export interface GetOrderResponse {
  message: string;
  data: {
    _id: string;
    orderNumber: number;
    orderStatus: string;
    totalAmount: number;
    createdAt: string;
    tableNumber?: number;
  };
}

export interface CreateOrderRequest {
  customerFirstName: string;
  customerLastName: string;
  customerPhoneNumber: string;
  paymentMethod: "Cash" | "CreditCard";
  tableNumber?: number;
  shopName: string;
  orderItems: {
    menuItem: string;
    quantity: number;
    customizationDetails?: string;
    selectedOptions?: {
      optionId: string;
      choiceIds: string[];
    }[];
  }[];
}
