import type { GetRolesResponse } from "@/types/role";
import { axiosInstance } from "./axiosInint";

export const rolesApi = {
  GetRoles: (): Promise<GetRolesResponse> => {
    return axiosInstance.get("/roles").then((res) => res.data);
  },
};
