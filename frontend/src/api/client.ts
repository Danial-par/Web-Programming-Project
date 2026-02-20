import { getAuthToken } from "../auth/token";

export interface ApiErrorPayload {
  detail: string;
  code?: string;
  fields?: Record<string, unknown>;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.detail);
    this.name = "ApiError";
    this.status = status;
    this.code = payload.code;
    this.fields = payload.fields;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null) {
  onUnauthorized = handler;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export async function apiRequest<TResponse>(
  path: string,
  options: RequestInit = {}
): Promise<TResponse> {
  const url = `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const token = getAuthToken();
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  const maybeJson = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    const payload: ApiErrorPayload = {
      detail: maybeJson?.detail ?? "Request failed",
      code: maybeJson?.code,
      fields: maybeJson?.fields
    };
    throw new ApiError(response.status, payload);
  }

  return maybeJson as TResponse;
}

