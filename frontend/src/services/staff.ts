import type { AddStaffRequest } from "@/types/validations/user/staff";
import { axiosInstance } from "./axiosInint";
import type {
  AddStaffMemberResponse,
  DeleteMemberResponse,
  GetMembersResponse,
  UpdateRoleResponse,
} from "@/types/staff";

export const staffApi = {
  getMembers: (shopId: string): Promise<GetMembersResponse> => {
    return axiosInstance
      .get(`/shops/${shopId}/members`)
      .then((res) => res.data);
  },

  addMember: (
    shopId: string,
    formData: AddStaffRequest,
  ): Promise<AddStaffMemberResponse> => {
    return axiosInstance
      .post(`/shops/${shopId}/members`, formData)
      .then((res) => res.data);
  },

  updateRole: (
    shopId: string,
    userId: string,
    roleId: string,
  ): Promise<UpdateRoleResponse> => {
    return axiosInstance
      .put(`/shops/${shopId}/members/${userId}`, { roleId: roleId })
      .then((res) => res.data);
  },

  deleteMember: (
    shopId: string,
    userId: string,
  ): Promise<DeleteMemberResponse> => {
    return axiosInstance
      .delete(`/shops/${shopId}/members/${userId}`)
      .then((res) => res.data);
  },
};
