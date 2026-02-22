import React from "react";
import { ApiError } from "../../api/client";
import { getErrorMessage, isApiError } from "../../utils/errors";
import { Alert } from "./Alert";
import { Button } from "./Button";

export interface ApiErrorAlertProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

export const ApiErrorAlert: React.FC<ApiErrorAlertProps> = ({ title = "Request failed", error, onRetry }) => {
  const message = getErrorMessage(error);
  const apiError = isApiError(error) ? (error as ApiError) : null;

  return (
    <Alert
      variant="error"
      title={title}
      actions={
        onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null
      }
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div>{message}</div>
        {apiError && (apiError.code || apiError.fields) && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {apiError.code && (
              <span>
                <strong style={{ color: "var(--text)" }}>code:</strong> {apiError.code}
              </span>
            )}
            {apiError.code && apiError.fields ? <span> · </span> : null}
            {apiError.fields ? (
              <span>
                <strong style={{ color: "var(--text)" }}>fields:</strong> {JSON.stringify(apiError.fields)}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Alert>
  );
};