import React, { useMemo, useState } from "react";
import { apiRequest, ApiError } from "../api/client";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/TextInput";
import { useToast } from "../utils/toast";
import { formatDateTime } from "../utils/format";

type TipStatus =
  | "submitted"
  | "officer_rejected"
  | "forwarded_to_detective"
  | "detective_rejected"
  | "approved"
  | string;

interface TipReward {
  reward_code: string;
  reward_amount: number;
  created_at: string;
}

interface TipRecord {
  id: number;
  user: number;
  case: number | null;
  suspect: number | null;
  details: string;
  status: TipStatus;
  reward: TipReward | null;
  officer_message?: string;
  detective_message?: string;
  created_at: string;
  updated_at?: string;
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function statusLabel(status: string): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "forwarded_to_detective":
      return "Forwarded to detective";
    case "approved":
      return "Approved";
    case "officer_rejected":
      return "Rejected by officer";
    case "detective_rejected":
      return "Rejected by detective";
    default:
      return status;
  }
}

export const TipsPage: React.FC = () => {
  const { showError, showSuccess } = useToast();

  const [caseId, setCaseId] = useState("");
  const [suspectId, setSuspectId] = useState("");
  const [details, setDetails] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [tip, setTip] = useState<TipRecord | null>(null);

  const validation = useMemo(() => {
    const errors: { caseId?: string; suspectId?: string; details?: string } = {};

    if (caseId.trim() && parsePositiveInt(caseId) === null) {
      errors.caseId = "Case ID must be a positive integer.";
    }
    if (suspectId.trim() && parsePositiveInt(suspectId) === null) {
      errors.suspectId = "Suspect ID must be a positive integer.";
    }
    if (!details.trim()) {
      errors.details = "Details is required.";
    }

    return errors;
  }, [caseId, suspectId, details]);

  const canSubmit = Object.keys(validation).length === 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!canSubmit) {
      showError("Please fix form errors first.");
      return;
    }

    const payload: any = {
      details: details.trim()
    };

    const parsedCase = parsePositiveInt(caseId);
    const parsedSuspect = parsePositiveInt(suspectId);
    if (parsedCase) payload.case = parsedCase;
    if (parsedSuspect) payload.suspect = parsedSuspect;

    setIsSubmitting(true);
    try {
      const created = await apiRequest<TipRecord>("/tips/", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setTip(created);
      showSuccess("Tip submitted successfully.");
      setDetails("");
      // keep case/suspect inputs in place to help submit multiple tips quickly
    } catch (err) {
      setSubmitError(err);
      const message = err instanceof ApiError ? err.message : "Failed to submit tip.";
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Tips & Rewards</h1>
          <p className="page__subtitle">Submit a tip and view your reward code after approval.</p>
        </div>
        <BackToDashboardButton />
      </div>

      <div className="page__grid" style={{ display: "grid", gap: "1rem" }}>
        <Card title="Submit a tip">
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
              <TextInput
                label="Case ID (optional)"
                placeholder="e.g. 12"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                error={validation.caseId}
                inputMode="numeric"
              />
              <TextInput
                label="Suspect ID (optional)"
                placeholder="e.g. 5"
                value={suspectId}
                onChange={(e) => setSuspectId(e.target.value)}
                error={validation.suspectId}
                inputMode="numeric"
              />
            </div>

            <div className="ui-field">
              <label className="ui-field__label" htmlFor="tip-details">
                Details
              </label>
              <textarea
                id="tip-details"
                className="ui-input"
                style={{ minHeight: 120, resize: "vertical" }}
                placeholder="Write your tip details..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              {validation.details && <div className="ui-field__error">{validation.details}</div>}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? "Submitting..." : "Submit tip"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setCaseId("");
                  setSuspectId("");
                  setDetails("");
                  setSubmitError(null);
                }}
              >
                Clear
              </Button>
            </div>
          </form>

          {submitError ? (
            <div style={{ marginTop: "1rem" }}>
              <ApiErrorAlert title="Tip submission failed" error={submitError} />
            </div>
          ) : null}
        </Card>

        <Card title="Latest submitted tip">
          {!tip ? (
            <div className="workflow-muted">No tip submitted in this session yet.</div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>Tip #{tip.id}</div>
                <span className="status-pill status-pill--neutral">{statusLabel(tip.status)}</span>
                <span className="workflow-muted">Created: {formatDateTime(tip.created_at)}</span>
              </div>

              <div style={{ display: "grid", gap: "0.35rem" }}>
                <div>
                  <strong>Case:</strong> {tip.case ?? "—"}
                </div>
                <div>
                  <strong>Suspect:</strong> {tip.suspect ?? "—"}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Details</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{tip.details}</div>
              </div>

              {(tip.officer_message || tip.detective_message) && (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {tip.officer_message ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Officer message</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{tip.officer_message}</div>
                    </div>
                  ) : null}
                  {tip.detective_message ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Detective message</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{tip.detective_message}</div>
                    </div>
                  ) : null}
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Reward</div>

                {tip.status === "approved" && tip.reward ? (
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <div>
                      <strong>Reward code:</strong>{" "}
                      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {tip.reward.reward_code}
                      </span>
                    </div>
                    <div>
                      <strong>Amount:</strong> {tip.reward.reward_amount.toLocaleString()}
                    </div>
                    <div className="workflow-muted">
                      Issued: {formatDateTime(tip.reward.created_at)}
                    </div>
                  </div>
                ) : (
                  <div className="workflow-muted">
                    Reward code will appear here after the detective approves your tip.
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};