import type { Shop, ShopMemberDetail } from "./shop";
import type { User } from "./user";

export interface GetMembersResponse {
  message: string;
  data: ShopMemberDetail[];
}

export interface AddStaffMemberResponse {
  message: string;
  data: User;
}

export interface UpdateRoleResponse {
  message: string;
  data: Shop;
}

export interface DeleteMemberResponse {
  message: string;
  data: Shop;
}
