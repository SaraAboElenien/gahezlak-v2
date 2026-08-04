import { axiosInstance } from "./axiosInint";

interface getAdminParams {
  page: number;
  limit: number;
  search?: string;
}

interface ApiParams {
  page: number;
  limit: number;
  search?: string;
}

export const getAdminUsers = async ({
  page,
  limit,
  search,
}: getAdminParams) => {
  const params: ApiParams = { page, limit };
  if (search?.trim()) {
    params.search = search.trim();
  }

  const res = await axiosInstance.get("/users", { params });
  return res.data;
};

export const getAdminShops = async ({
  page,
  limit,
  search,
}: getAdminParams) => {
  const params: ApiParams = { page, limit };
  if (search?.trim()) {
    params.search = search.trim();
  }

  const res = await axiosInstance.get("/shops", { params });
  return res.data;
};

export const getAdminSubscriptions = async ({
  page,
  limit,
  search,
}: getAdminParams) => {
  const params: ApiParams = { page, limit };
  if (search?.trim()) {
    params.search = search.trim();
  }

  const res = await axiosInstance.get("/subscriptions", { params });
  return res.data;
};
