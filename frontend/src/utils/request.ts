export class ApiRequestError extends Error {
  code: string;
  details: unknown;

  constructor(code: string, message: string, details: unknown = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", "x-demo-role": "PI", ...(options.headers || {}) }
  });
  const payload = await response.json();
  if (!response.ok) throw new ApiRequestError(payload.code ?? "UNKNOWN_ERROR", payload.message ?? "请求失败", payload.details ?? null);
  return payload.data as T;
}
