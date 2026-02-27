import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { TextInput } from "../components/ui/TextInput";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { useAuthContext } from "../auth/AuthContext";
import { useToast } from "../utils/toast";
import {
  TipRecord,
  listTips,
  officerReviewTip,
  detectiveReviewTip,
} from "../api/tips";

function hasAnyRole(userRoles: string[] | undefined, roles: string[]) {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.some((r) => roles.includes(r));
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

export const TipsReviewPage: React.FC = () => {
  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();

  const isOfficer = useMemo(
    () => hasAnyRole(user?.roles, ["Police Officer", "Patrol Officer", "Sergeant", "Captain", "Chief", "Admin"]),
    [user?.roles]
  );

  const isDetective = useMemo(
    () => hasAnyRole(user?.roles, ["Detective", "Sergeant", "Captain", "Chief", "Admin"]),
    [user?.roles]
  );

  // Decide which queue to show by default:
  const defaultQueue = useMemo(() => {
    if (isOfficer) return "submitted";
    if (isDetective) return "forwarded_to_detective";
    return "submitted";
  }, [isOfficer, isDetective]);

  const [queue, setQueue] = useState<string>(defaultQueue);
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const [selectedTip, setSelectedTip] = useState<TipRecord | null>(null);
  const [message, setMessage] = useState("");
  const [acting, setActing] = useState(false);

  const canSeeOfficerQueue = isOfficer;
  const canSeeDetectiveQueue = isDetective;

  useEffect(() => {
    setQueue(defaultQueue);
  }, [defaultQueue]);

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await listTips({ status: queue });
      setTips(res);
    } catch (e) {
      setErr(e);
      setTips([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  const openTip = (tip: TipRecord) => {
    setSelectedTip(tip);
    setMessage("");
  };

  const closeTip = () => {
    setSelectedTip(null);
    setMessage("");
  };

  const refreshAfterAction = async (updated?: TipRecord) => {
    // If current queue no longer contains this tip (status changed), remove locally
    if (updated) {
      setTips((prev) => prev.filter((t) => t.id !== updated.id));
      setSelectedTip(updated); // show new status + reward if any
    }
    await load();
  };

  const doOfficerForward = async () => {
    if (!selectedTip) return;
    setActing(true);
    try {
      const updated = await officerReviewTip(selectedTip.id, { decision: "forward", message: message.trim() || undefined });
      showSuccess("Tip forwarded to detective.");
      await refreshAfterAction(updated);
    } catch (e: any) {
      showError(e?.message || "Failed to forward.");
    } finally {
      setActing(false);
    }
  };

  const doOfficerReject = async () => {
    if (!selectedTip) return;
    if (!message.trim()) {
      showError("Please provide a rejection message.");
      return;
    }
    setActing(true);
    try {
      const updated = await officerReviewTip(selectedTip.id, { decision: "reject", message: message.trim() });
      showSuccess("Tip rejected.");
      await refreshAfterAction(updated);
    } catch (e: any) {
      showError(e?.message || "Failed to reject.");
    } finally {
      setActing(false);
    }
  };

  const doDetectiveApprove = async () => {
    if (!selectedTip) return;
    setActing(true);
    try {
      const updated = await detectiveReviewTip(selectedTip.id, { decision: "approve", message: message.trim() || undefined });
      showSuccess("Tip approved. Reward generated.");
      await refreshAfterAction(updated);
    } catch (e: any) {
      showError(e?.message || "Failed to approve.");
    } finally {
      setActing(false);
    }
  };

  const doDetectiveReject = async () => {
    if (!selectedTip) return;
    if (!message.trim()) {
      showError("Please provide a rejection message.");
      return;
    }
    setActing(true);
    try {
      const updated = await detectiveReviewTip(selectedTip.id, { decision: "reject", message: message.trim() });
      showSuccess("Tip rejected.");
      await refreshAfterAction(updated);
    } catch (e: any) {
      showError(e?.message || "Failed to reject.");
    } finally {
      setActing(false);
    }
  };

  if (!canSeeOfficerQueue && !canSeeDetectiveQueue) {
    return (
      <div className="page">
        <h1 className="page__title">Tips Review</h1>
        <Alert variant="error" title="Access denied">
          You do not have a role that can review tips.
        </Alert>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Tips Review</h1>
          <p className="page__subtitle">Review and process tips.</p>
        </div>
      </div>

      <Card title="Queues">
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canSeeOfficerQueue && (
            <Button
              type="button"
              variant={queue === "submitted" ? "primary" : "secondary"}
              onClick={() => setQueue("submitted")}
            >
              Officer queue (submitted)
            </Button>
          )}
          {canSeeDetectiveQueue && (
            <Button
              type="button"
              variant={queue === "forwarded_to_detective" ? "primary" : "secondary"}
              onClick={() => setQueue("forwarded_to_detective")}
            >
              Detective queue (forwarded)
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card title={`Tips (${statusLabel(queue)})`}>
        {loading ? (
          <div className="workflow-muted">Loading...</div>
        ) : err ? (
          <ApiErrorAlert title="Failed to load tips" error={err} />
        ) : tips.length === 0 ? (
          <div className="workflow-muted">No tips in this queue.</div>
        ) : (
          <div className="workflow-stack" style={{ gap: "0.5rem" }}>
            {tips.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.75rem",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Tip #{t.id}</div>
                  <div className="workflow-muted" style={{ fontSize: "0.9rem" }}>
                    Status: {statusLabel(t.status)} · Case: {t.case ?? "—"} · Suspect: {t.suspect ?? "—"}
                  </div>
                </div>
                <Button type="button" variant="secondary" onClick={() => openTip(t)}>
                  Review
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedTip && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Tip #{selectedTip.id}</h2>
              <Button type="button" variant="ghost" onClick={closeTip}>
                ✕
              </Button>
            </div>

            <div className="workflow-muted" style={{ marginTop: 6 }}>
              Status: {statusLabel(selectedTip.status)}
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <div><strong>Case:</strong> {selectedTip.case ?? "—"}</div>
              <div><strong>Suspect:</strong> {selectedTip.suspect ?? "—"}</div>
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Details</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{selectedTip.details}</div>
            </div>

            {selectedTip.reward && (
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Reward</div>
                <div>
                  <strong>Code:</strong>{" "}
                  <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {selectedTip.reward.reward_code}
                  </span>
                </div>
                <div><strong>Amount:</strong> {selectedTip.reward.reward_amount.toLocaleString()}</div>
              </div>
            )}

            <div style={{ marginTop: "0.75rem" }}>
              <TextInput
                label="Message (required for reject)"
                placeholder="Write a message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem", flexWrap: "wrap" }}>
              {/* Officer actions */}
              {queue === "submitted" && canSeeOfficerQueue && (
                <>
                  <Button type="button" variant="secondary" disabled={acting} onClick={doOfficerReject}>
                    Reject
                  </Button>
                  <Button type="button" disabled={acting} onClick={doOfficerForward}>
                    Forward to detective
                  </Button>
                </>
              )}

              {/* Detective actions */}
              {queue === "forwarded_to_detective" && canSeeDetectiveQueue && (
                <>
                  <Button type="button" variant="secondary" disabled={acting} onClick={doDetectiveReject}>
                    Reject
                  </Button>
                  <Button type="button" disabled={acting} onClick={doDetectiveApprove}>
                    Approve (generate reward)
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};