export interface Report {
  _id: string;
  senderFirstName?: string;
  senderLastName?: string;
  receiver: string;
  message: string;
  shopId?: string;
  orderNumber?: number;
  phoneNumber: number;
  shopName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportResponse {
  message: string;
  data: Report;
}

export interface ReportListResponse {
  message: string;
  data: Report[];
}
