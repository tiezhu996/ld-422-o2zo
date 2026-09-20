import type { CloseBlocker } from "../types/project";

export type ApiErrorDetails = { blockers?: CloseBlocker[] } & Record<string, unknown>;

export class ApiRequestError extends Error {
  code: string;
  details?: ApiErrorDetails;

  constructor(code: string, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.details = details;
  }

  get blockers(): CloseBlocker[] {
    return this.details?.blockers ?? [];
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", "x-demo-role": "PI", ...(options.headers || {}) }
  });
  const payload = await response.json();
  if (!response.ok) throw new ApiRequestError(payload.code ?? "ERROR", payload.message ?? "请求失败", payload.details);
  return payload.data as T;
}
