import React, { useMemo, useState } from "react";
import {
  assignBailAmount,
  assignFineAmount,
  getReleaseInfo,
  ReleaseInfo,
  startBailPayment,
  startFinePayment
} from "../api/investigations";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { TextInput } from "../components/ui/TextInput";
import { useRBAC } from "../auth/rbac";
import { useToast } from "../utils/toast";
import { formatDateTime } from "../utils/format";

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export const BailFinePage: React.FC = () => {
  const { showError, showSuccess } = useToast();
  const { hasRole } = useRBAC();

  const [caseId, setCaseId] = useState("");
  const [suspectId, setSuspectId] = useState("");
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [lookupError, setLookupError] = useState<unknown>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [bailAmount, setBailAmount] = useState("");
  const [fineAmount, setFineAmount] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  const [paymentLoading, setPaymentLoading] = useState(false);

  const validation = useMemo(() => {
    const errors: { caseId?: string; suspectId?: string } = {};
    if (parsePositiveInt(caseId) === null) errors.caseId = "Case ID must be a positive integer.";
    if (parsePositiveInt(suspectId) === null) errors.suspectId = "Suspect ID must be a positive integer.";
    return errors;
  }, [caseId, suspectId]);

  const canLookup = Object.keys(validation).length === 0 && !lookupLoading;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setReleaseInfo(null);

    if (!canLookup) {
      showError("Please fix form errors first.");
      return;
    }

    setLookupLoading(true);
    try {
      const info = await getReleaseInfo(Number(caseId), Number(suspectId));
      setReleaseInfo(info);
      showSuccess("Release info loaded.");
    } catch (err) {
      setLookupError(err);
      showError("Failed to load release info.");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleAssignBail = async () => {
    if (!releaseInfo) return;
    const amount = parsePositiveInt(bailAmount);
    if (!amount) {
      showError("Enter a valid bail amount.");
      return;
    }
    setAssignLoading(true);
    try {
      await assignBailAmount(releaseInfo.case_id, releaseInfo.suspect_id, amount);
      showSuccess("Bail amount assigned.");
      const refreshed = await getReleaseInfo(releaseInfo.case_id, releaseInfo.suspect_id);
      setReleaseInfo(refreshed);
    } catch (err) {
      showError("Failed to assign bail amount.");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssignFine = async () => {
    if (!releaseInfo) return;
    const amount = parsePositiveInt(fineAmount);
    if (!amount) {
      showError("Enter a valid fine amount.");
      return;
    }
    setAssignLoading(true);
    try {
      await assignFineAmount(releaseInfo.case_id, releaseInfo.suspect_id, amount);
      showSuccess("Fine amount assigned.");
      const refreshed = await getReleaseInfo(releaseInfo.case_id, releaseInfo.suspect_id);
      setReleaseInfo(refreshed);
    } catch (err) {
      showError("Failed to assign fine amount.");
    } finally {
      setAssignLoading(false);
    }
  };

  const handleStartBailPayment = async () => {
    if (!releaseInfo) return;
    setPaymentLoading(true);
    try {
      const res = await startBailPayment(releaseInfo.case_id, releaseInfo.suspect_id);
      window.location.assign(res.payment_url);
    } catch (err) {
      showError("Failed to start bail payment.");
      setPaymentLoading(false);
    }
  };

  const handleStartFinePayment = async () => {
    if (!releaseInfo) return;
    setPaymentLoading(true);
    try {
      const res = await startFinePayment(releaseInfo.case_id, releaseInfo.suspect_id);
      window.location.assign(res.payment_url);
    } catch (err) {
      showError("Failed to start fine payment.");
      setPaymentLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Bail & Fine Payments</h1>
          <p className="page__subtitle">Lookup a suspect and start a bail/fine payment via Zarinpal.</p>
        </div>
        <BackToDashboardButton />
      </div>

      <div className="page__grid" style={{ display: "grid", gap: "1rem" }}>
        <Card title="Lookup suspect">
          <form onSubmit={handleLookup} style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
              <TextInput
                label="Case ID"
                placeholder="e.g. 12"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                error={validation.caseId}
                inputMode="numeric"
              />
              <TextInput
                label="Suspect ID"
                placeholder="e.g. 5"
                value={suspectId}
                onChange={(e) => setSuspectId(e.target.value)}
                error={validation.suspectId}
                inputMode="numeric"
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Button type="submit" disabled={!canLookup}>
                {lookupLoading ? "Loading..." : "Load release info"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={lookupLoading}
                onClick={() => {
                  setCaseId("");
                  setSuspectId("");
                  setLookupError(null);
                  setReleaseInfo(null);
                }}
              >
                Clear
              </Button>
            </div>
          </form>

          {lookupError ? (
            <div style={{ marginTop: "1rem" }}>
              <ApiErrorAlert title="Lookup failed" error={lookupError} />
            </div>
          ) : null}
        </Card>

        <Card title="Release details">
          {!releaseInfo ? (
            <div className="workflow-muted">No release info loaded yet.</div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div className="workflow-grid">
                <div>
                  <div className="workflow-kv__label">Custody status</div>
                  <div className="workflow-kv__value">{releaseInfo.custody_status}</div>
                </div>
                <div>
                  <div className="workflow-kv__label">Bail amount</div>
                  <div className="workflow-kv__value">{releaseInfo.bail_amount?.toLocaleString() ?? "—"}</div>
                </div>
                <div>
                  <div className="workflow-kv__label">Fine amount</div>
                  <div className="workflow-kv__value">{releaseInfo.fine_amount?.toLocaleString() ?? "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <div>
                  <strong>Bail eligible:</strong> {releaseInfo.bail_eligible ? "Yes" : "No"}
                </div>
                <div>
                  <strong>Fine eligible:</strong> {releaseInfo.fine_eligible ? "Yes" : "No"}
                </div>
              </div>

              {releaseInfo.last_payment && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Last payment</div>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <div>
                      <strong>Type:</strong> {releaseInfo.last_payment.payment_type}
                    </div>
                    <div>
                      <strong>Status:</strong> {releaseInfo.last_payment.status}
                    </div>
                    <div>
                      <strong>Amount:</strong> {releaseInfo.last_payment.amount.toLocaleString()}
                    </div>
                    <div className="workflow-muted">
                      Created: {formatDateTime(releaseInfo.last_payment.created_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {releaseInfo && hasRole("Sergeant") && (
          <Card title="Sergeant: assign amounts">
            <div style={{ display: "grid", gap: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                <TextInput
                  label="Bail amount (Rial)"
                  placeholder="e.g. 50000000"
                  value={bailAmount}
                  onChange={(e) => setBailAmount(e.target.value)}
                  inputMode="numeric"
                />
                <Button type="button" variant="secondary" disabled={assignLoading || !releaseInfo.bail_eligible} onClick={handleAssignBail}>
                  {assignLoading ? "Saving..." : "Assign bail"}
                </Button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
                <TextInput
                  label="Fine amount (Rial)"
                  placeholder="e.g. 80000000"
                  value={fineAmount}
                  onChange={(e) => setFineAmount(e.target.value)}
                  inputMode="numeric"
                />
                <Button type="button" variant="secondary" disabled={assignLoading || !releaseInfo.fine_eligible} onClick={handleAssignFine}>
                  {assignLoading ? "Saving..." : "Assign fine"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {releaseInfo && (
          <Card title="Start payment">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Button
                type="button"
                disabled={paymentLoading || !releaseInfo.bail_eligible || !releaseInfo.bail_assigned}
                onClick={handleStartBailPayment}
              >
                {paymentLoading ? "Redirecting..." : "Pay bail"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={paymentLoading || !releaseInfo.fine_eligible || !releaseInfo.fine_assigned}
                onClick={handleStartFinePayment}
              >
                {paymentLoading ? "Redirecting..." : "Pay fine"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
