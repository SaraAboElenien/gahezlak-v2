export type RoleName =
  "admin" | "user" | "shop_owner" | "shop_manager" | "shop_staff";

export interface Role {
  _id: string;
  name: RoleName;
  permissions?: string[];
}

export interface GetRolesResponse {
  message: string;
  data: Role[];
}
