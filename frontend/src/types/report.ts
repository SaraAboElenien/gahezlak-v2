export interface Report {
  _id: string;
  senderFirstName?: string;
  senderLastName?: string;
  receiver: string;
  message: string;
  shopId?: string;
  orderNumber?: number;
  // Was `number` — the backend stored this as a Number and lost the leading
  // zero of Egyptian mobile numbers (e.g. "01012345678" -> 1012345678). The
  // backend now stores and returns it as a String; see
  // backend/models/Report.ts and TECH_DEBT.md's "Report phone numbers are
  // stored as numbers" entry.
  phoneNumber: string;
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
