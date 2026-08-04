export interface ShopMember {
  userId: string;
  roleId: string;
  _id: string;
}

export interface ShopMemberDetail {
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  roleId: {
    _id: string;
    name: string;
  };
  _id: string;
}

export interface Shop {
  _id: string;
  name: string;
  type: string;
  address: {
    country: string;
    city: string;
    street: string;
  };
  phoneNumber: string;
  email: string;
  ownerId: string;
  subscriptionId: string | null;
  qrCodeImage?: string;
  logoUrl?: string;
  members: ShopMember[];
  isPaymentDone: boolean;
  createdAt: string;
  updatedAt: string;
}

// PUBLIC SHOP API RESPONSE FOR PUBLIC MENU PAGE
export interface PublicShop {
  _id: string;
  name: string;
  type: string;
  address: {
    country: string;
    city: string;
    street: string;
  };
  qrCodeUrl: string;
  logoUrl: string;
}
export interface PublicShopResponse {
  message: string;
  data: PublicShop;
}

export interface GetShopByAdminResponse {
  message: string;
  data: Shop;
}
