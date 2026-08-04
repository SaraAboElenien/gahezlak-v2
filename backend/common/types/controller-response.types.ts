export type PaginatedResponse<T> = {
  message: "Data retreived." | string;
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};

export type SuccessResponse<T> = {
  message: "Data retreived." | string;
  data: T;
};

export type ErrorResponse = {
  code: number;
  message: string;
  // Write-only payload: serializers put whatever detail they have here (an
  // empty object for most errors, a multer message for upload failures).
  // `unknown` keeps callers from reading it without narrowing first.
  data: unknown;
};

export type ValidationErrorResponse = { message: string; field?: string }[];
