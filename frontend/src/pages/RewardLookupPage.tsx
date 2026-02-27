import React, { useMemo, useState } from "react";
import { apiRequest, ApiError } from "../api/client";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/TextInput";
import { useToast } from "../utils/toast";
import { formatDateTime } from "../utils/format";

interface RewardLookupResult {
  reward_code: string;
  reward_amount: number;
  created_at: string;
  tip_user: {
    id: number;
    national_id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
}

export const RewardLookupPage: React.FC = () => {
  const { showError, showSuccess } = useToast();

  const [nationalId, setNationalId] = useState("");
  const [rewardCode, setRewardCode] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupError, setLookupError] = useState<unknown>(null);
  const [result, setResult] = useState<RewardLookupResult | null>(null);

  const validation = useMemo(() => {
    const errors: { nationalId?: string; rewardCode?: string } = {};

    if (!nationalId.trim()) errors.nationalId = "National ID is required.";
    if (!rewardCode.trim()) errors.rewardCode = "Reward code is required.";

    return errors;
  }, [nationalId, rewardCode]);

  const canSubmit = Object.keys(validation).length === 0 && !isSubmitting;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setResult(null);

    if (!canSubmit) {
      showError("Please fix form errors first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        national_id: nationalId.trim(),
        reward_code: rewardCode.trim()
      };

      const data = await apiRequest<RewardLookupResult>("/rewards/lookup/", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setResult(data);
      showSuccess("Reward found.");
    } catch (err) {
      setLookupError(err);
      const message = err instanceof ApiError ? err.message : "Lookup failed.";
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Reward Lookup</h1>
          <p className="page__subtitle">Verify a reward using national ID and reward code.</p>
        </div>
        <BackToDashboardButton />
      </div>

      <div className="page__grid" style={{ display: "grid", gap: "1rem" }}>
        <Card title="Lookup form">
          <form onSubmit={handleLookup} style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
              <TextInput
                label="National ID"
                placeholder="e.g. 1234567890"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                error={validation.nationalId}
              />
              <TextInput
                label="Reward code"
                placeholder="e.g. RW-ABC123..."
                value={rewardCode}
                onChange={(e) => setRewardCode(e.target.value)}
                error={validation.rewardCode}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? "Searching..." : "Lookup reward"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setNationalId("");
                  setRewardCode("");
                  setLookupError(null);
                  setResult(null);
                }}
              >
                Clear
              </Button>
            </div>
          </form>

          {lookupError ? (
            <div style={{ marginTop: "1rem" }}>
              <ApiErrorAlert title="Reward lookup failed" error={lookupError} />
            </div>
          ) : null}
        </Card>

        <Card title="Lookup result">
          {!result ? (
            <div className="workflow-muted">No result yet.</div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "grid", gap: "0.35rem" }}>
                <div>
                  <strong>Reward code:</strong>{" "}
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {result.reward_code}
                  </span>
                </div>
                <div>
                  <strong>Amount:</strong> {result.reward_amount.toLocaleString()}
                </div>
                <div className="workflow-muted">
                  Issued: {formatDateTime(result.created_at)}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Tip submitter</div>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  <div>
                    <strong>Username:</strong> {result.tip_user.username}
                  </div>
                  <div>
                    <strong>National ID:</strong> {result.tip_user.national_id}
                  </div>
                  <div>
                    <strong>Name:</strong>{" "}
                    {(result.tip_user.first_name || result.tip_user.last_name)
                      ? `${result.tip_user.first_name ?? ""} ${result.tip_user.last_name ?? ""}`.trim()
                      : "—"}
                  </div>
                  <div>
                    <strong>Phone:</strong> {result.tip_user.phone || "—"}
                  </div>
                  <div>
                    <strong>Email:</strong> {result.tip_user.email || "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};