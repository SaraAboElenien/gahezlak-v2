import { axiosInstance } from "./axiosInint";
import type { ReportResponse, ReportListResponse } from "@/types/report";

export type AdminReportFormData = {
  senderFirstName: string;
  senderLastName: string;
  message: string;
  phoneNumber: string;
  shopName: string;
};

export type ShopReportFormData = {
  senderFirstName?: string;
  senderLastName?: string;
  phoneNumber: string;
  orderNumber: number;
  message: string;
};

export const reportApi = {
  // POST - Contact Admin
  contactAdmin: (data: AdminReportFormData): Promise<ReportResponse> => {
    return axiosInstance.post("/reports/admin", data).then((res) => res.data);
  },

  // GET - Admin reports
  getAdminReports: (): Promise<ReportListResponse> => {
    return axiosInstance.get("/reports/admin").then((res) => res.data);
  },

  // POST - Report Shop
  contactShop: (
    shopName: string,
    data: ShopReportFormData,
  ): Promise<ReportResponse> => {
    return axiosInstance
      .post(`/reports/${shopName}/shop`, data)
      .then((res) => res.data);
  },

  //  GET - Shop reports
  getShopReports: (): Promise<ReportListResponse> => {
    return axiosInstance.get("/reports/shop").then((res) => res.data);
  },
};
