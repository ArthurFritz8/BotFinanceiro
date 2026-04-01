export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<TData> {
  data: TData;
  meta: ApiMeta;
  status: "success";
}

export interface ApiErrorBody {
  code: string;
  details?: unknown;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
  meta: ApiMeta;
  status: "error";
}

function buildMeta(requestId: string): ApiMeta {
  return {
    requestId,
    timestamp: new Date().toISOString(),
  };
}

export function buildSuccessResponse<TData>(
  requestId: string,
  data: TData,
): ApiSuccessResponse<TData> {
  return {
    data,
    meta: buildMeta(requestId),
    status: "success",
  };
}

export function buildErrorResponse(
  requestId: string,
  error: ApiErrorBody,
): ApiErrorResponse {
  return {
    error,
    meta: buildMeta(requestId),
    status: "error",
  };
}