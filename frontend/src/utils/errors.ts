import { ApiError } from "../api/client";

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (isApiError(error)) {
    const parts: string[] = [];
    parts.push(error.message || "Request failed");
    const meta: string[] = [];
    if (typeof error.status === "number") meta.push(`status ${error.status}`);
    if (error.code) meta.push(`code ${error.code}`);
    if (meta.length) parts.push(`(${meta.join(", ")})`);
    return parts.join(" ");
  }
  if (error instanceof Error) return error.message || "Unknown error";
  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}