import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCase } from "../api/cases";
import { getCaseReport } from "../api/caseReports";
import {
  CaseSuspect,
  proposeSuspect,
  reviewSuspect,
  submitCaptainDecision,
  submitChiefReview,
  submitDetectiveInterrogationScore,
  submitSergeantInterrogationScore
} from "../api/investigations";
import { RoleGuard, useRBAC } from "../auth/rbac";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { getErrorMessage } from "../utils/errors";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel } from "../utils/workflow";

type ReviewDecision = "approve" | "reject";

function getStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "proposed") return "warning";
  return "neutral";
}

function asCaseSuspectFromReport(reportSuspect: any): CaseSuspect {
  // This is a light adapter:
  // - investigations.CaseSuspect has extra username fields not present in case report
  // - We fill missing fields with safe defaults so the UI can render.
  return {
    id: reportSuspect.id,
    case: reportSuspect.case,
    first_name: reportSuspect.first_name,
    last_name: reportSuspect.last_name,
    national_id: reportSuspect.national_id,
    phone: reportSuspect.phone,
    notes: reportSuspect.notes,
    photo: null,
    proposed_by: reportSuspect.proposed_by ?? null,
    proposed_by_username: "",
    proposed_at: reportSuspect.proposed_at,
    status: reportSuspect.status,
    sergeant_message: reportSuspect.sergeant_message ?? "",
    reviewed_by: reportSuspect.reviewed_by ?? null,
    reviewed_by_username: "",
    reviewed_at: reportSuspect.reviewed_at ?? null
  };
}

export const CaseSuspectsPage: React.FC = () => {
  const { caseId } = useParams();
  const numericCaseId = Number(caseId);
  const { showError, showSuccess } = useToast();
  const { hasRole } = useRBAC();

  const {
    data: caseDetail,
    isLoading: caseLoading,
    error: caseError,
    refetch: refetchCase
  } = useAsyncData(() => getCase(numericCaseId), [numericCaseId]);

  const {
    data: caseReport,
    isLoading: reportLoading,
    error: reportError,
    refetch: refetchReport
  } = useAsyncData(() => getCaseReport(numericCaseId), [numericCaseId]);

  const suspects = useMemo(() => {
    const raw = (caseReport as any)?.suspects ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [caseReport]);

  const isCritical = (caseDetail?.crime_level ?? (caseReport as any)?.case?.crime_level) === "critical";

  // Propose suspect form state
  const [proposeFirstName, setProposeFirstName] = useState("");
  const [proposeLastName, setProposeLastName] = useState("");
  const [proposeNationalId, setProposeNationalId] = useState("");
  const [proposePhone, setProposePhone] = useState("");
  const [proposeNotes, setProposeNotes] = useState("");
  const [proposeSubmitting, setProposeSubmitting] = useState(false);

  // Sergeant review state per suspect
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { decision: ReviewDecision; message: string }>>({});
  const [reviewSubmitting, setReviewSubmitting] = useState<Record<number, boolean>>({});

  // Interrogation drafts per suspect
  const [detectiveScoreDraft, setDetectiveScoreDraft] = useState<Record<number, string>>({});
  const [sergeantScoreDraft, setSergeantScoreDraft] = useState<Record<number, string>>({});
  const [captainDecisionDraft, setCaptainDecisionDraft] = useState<
    Record<number, { decision: "approve" | "reject"; reasoning: string }>
  >({});
  const [chiefDecisionDraft, setChiefDecisionDraft] = useState<Record<number, { decision: "approve" | "reject"; message: string }>>({});
  const [interrogationSubmitting, setInterrogationSubmitting] = useState<Record<number, boolean>>({});

  const ensureReviewDraft = (suspectId: number) => {
    setReviewDrafts((prev) => {
      if (prev[suspectId]) return prev;
      return { ...prev, [suspectId]: { decision: "approve", message: "" } };
    });
  };

  const handlePropose = async () => {
    const first_name = proposeFirstName.trim();
    const last_name = proposeLastName.trim();
    const national_id = proposeNationalId.trim();
    const phone = proposePhone.trim();
    const notes = proposeNotes.trim();

    if (!first_name || !last_name || !national_id) {
      showError("First name, last name, and national ID are required.");
      return;
    }

    try {
      setProposeSubmitting(true);
      await proposeSuspect(numericCaseId, {
        first_name,
        last_name,
        national_id,
        phone: phone || undefined,
        notes: notes || undefined
      });
      showSuccess("Suspect proposed.");
      setProposeFirstName("");
      setProposeLastName("");
      setProposeNationalId("");
      setProposePhone("");
      setProposeNotes("");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setProposeSubmitting(false);
    }
  };

  const handleReview = async (suspectId: number) => {
    const draft = reviewDrafts[suspectId];
    if (!draft) return;

    try {
      setReviewSubmitting((prev) => ({ ...prev, [suspectId]: true }));
      await reviewSuspect(numericCaseId, suspectId, {
        decision: draft.decision,
        message: draft.message?.trim() || undefined
      });
      showSuccess("Review submitted.");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setReviewSubmitting((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleDetectiveScore = async (suspectId: number) => {
    const raw = detectiveScoreDraft[suspectId] ?? "";
    const score = Number(raw);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      showError("Detective score must be an integer between 1 and 10.");
      return;
    }
    try {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: true }));
      await submitDetectiveInterrogationScore(numericCaseId, suspectId, score);
      showSuccess("Detective score submitted.");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleSergeantScore = async (suspectId: number) => {
    const raw = sergeantScoreDraft[suspectId] ?? "";
    const score = Number(raw);
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      showError("Sergeant score must be an integer between 1 and 10.");
      return;
    }
    try {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: true }));
      await submitSergeantInterrogationScore(numericCaseId, suspectId, score);
      showSuccess("Sergeant score submitted.");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleCaptainDecision = async (suspectId: number) => {
    const draft = captainDecisionDraft[suspectId];
    if (!draft) {
      showError("Select approve/reject first.");
      return;
    }

    try {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: true }));
      await submitCaptainDecision(numericCaseId, suspectId, {
        captain_final_decision: draft.decision === "approve",
        captain_reasoning: draft.reasoning?.trim() || undefined
      });
      showSuccess("Captain decision submitted.");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  const handleChiefDecision = async (suspectId: number) => {
    const draft = chiefDecisionDraft[suspectId];
    if (!draft) {
      showError("Select approve/reject first.");
      return;
    }
    try {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: true }));
      await submitChiefReview(numericCaseId, suspectId, {
        chief_decision: draft.decision === "approve",
        chief_message: draft.message?.trim() || undefined
      });
      showSuccess("Chief decision submitted.");
      await refetchReport();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setInterrogationSubmitting((prev) => ({ ...prev, [suspectId]: false }));
    }
  };

  if (!caseId || Number.isNaN(numericCaseId)) {
    return (
      <div className="workflow-stack">
        <h1>Suspects</h1>
        <ApiErrorAlert title="Invalid case id" error={new Error("Missing or invalid :caseId route param")} />
      </div>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Suspects & Interrogation</h1>
          <p className="workflow-muted">
            Manage suspect proposals, review decisions, and interrogation scoring workflow for case #{numericCaseId}.
            You can return to the case workspace{" "}
            <Link className="workflow-link" to={`/cases/${numericCaseId}`}>
              here
            </Link>
            .
          </p>
          {isCritical && (
            <p className="workflow-muted workflow-muted--small">
              This is a critical case: chief review is required.
            </p>
          )}
        </div>
        <BackToDashboardButton />
      </section>

      {caseError && <ApiErrorAlert title="Failed to load case" error={caseError} onRetry={refetchCase} />}
      {reportError && <ApiErrorAlert title="Failed to load suspects" error={reportError} onRetry={refetchReport} />}

      <RoleGuard roles={["Detective"]}>
        <Card title="Propose a suspect">
          <div className="workflow-form">
            <div className="workflow-grid">
              <TextInput
                label="First name"
                value={proposeFirstName}
                onChange={(e) => setProposeFirstName(e.target.value)}
                disabled={proposeSubmitting}
              />
              <TextInput
                label="Last name"
                value={proposeLastName}
                onChange={(e) => setProposeLastName(e.target.value)}
                disabled={proposeSubmitting}
              />
              <TextInput
                label="National ID"
                value={proposeNationalId}
                onChange={(e) => setProposeNationalId(e.target.value)}
                disabled={proposeSubmitting}
                placeholder="10-digit national ID"
              />
              <TextInput
                label="Phone"
                value={proposePhone}
                onChange={(e) => setProposePhone(e.target.value)}
                disabled={proposeSubmitting}
                placeholder="Optional"
              />
            </div>

            <div className="workflow-field">
              <label className="ui-field__label">Notes</label>
              <textarea
                className="ui-textarea"
                value={proposeNotes}
                onChange={(e) => setProposeNotes(e.target.value)}
                disabled={proposeSubmitting}
                placeholder="Optional detective notes (why you suspect them)…"
              />
            </div>

            <div className="workflow-actions">
              <Button type="button" onClick={handlePropose} disabled={proposeSubmitting || caseLoading || reportLoading}>
                {proposeSubmitting ? "Submitting…" : "Propose suspect"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setProposeFirstName("");
                  setProposeLastName("");
                  setProposeNationalId("");
                  setProposePhone("");
                  setProposeNotes("");
                }}
                disabled={proposeSubmitting}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      </RoleGuard>

      <Card title="Suspect list">
        {(caseLoading || reportLoading) && (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <div className="ui-card" style={{ padding: "1.15rem" }}>
              <Skeleton height="1.2rem" width="40%" rounded={false} />
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.45rem" }}>
                <Skeleton height="0.9rem" width="88%" rounded={false} />
                <Skeleton height="0.9rem" width="76%" rounded={false} />
                <Skeleton height="0.9rem" width="92%" rounded={false} />
              </div>
            </div>
            <div className="ui-card" style={{ padding: "1.15rem" }}>
              <Skeleton height="1.2rem" width="35%" rounded={false} />
              <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.45rem" }}>
                <Skeleton height="0.9rem" width="84%" rounded={false} />
                <Skeleton height="0.9rem" width="60%" rounded={false} />
                <Skeleton height="0.9rem" width="94%" rounded={false} />
              </div>
            </div>
          </div>
        )}

        {!caseLoading && !reportLoading && suspects.length === 0 && (
          <div style={{ color: "var(--text-muted)" }}>No suspects have been proposed yet.</div>
        )}

        {!caseLoading && !reportLoading && suspects.length > 0 && (
          <div className="workflow-panel-grid">
            {suspects.map((rawSuspect: any) => {
              const suspect = asCaseSuspectFromReport(rawSuspect);
              const interrogation = rawSuspect.interrogation ?? null;
              const statusTone = getStatusTone(suspect.status);

              const isApproved = suspect.status === "approved";
              const detectiveScore = interrogation?.detective_score ?? null;
              const sergeantScore = interrogation?.sergeant_score ?? null;
              const captainDecision = interrogation?.captain_final_decision ?? null;
              const chiefDecision = interrogation?.chief_decision ?? null;

              const canDetectiveScore = isApproved && hasRole("Detective") && detectiveScore === null;
              const canSergeantScore = isApproved && hasRole("Sergeant") && sergeantScore === null;
              const canCaptainDecide =
                isApproved &&
                hasRole("Captain") &&
                detectiveScore !== null &&
                sergeantScore !== null &&
                captainDecision === null;
              const canChiefDecide =
                isApproved && isCritical && hasRole("Chief") && captainDecision === true && chiefDecision === null;

              const submitting = interrogationSubmitting[suspect.id] ?? false;
              const review = reviewDrafts[suspect.id];
              const captainDraft = captainDecisionDraft[suspect.id] ?? { decision: "approve", reasoning: "" };
              const chiefDraft = chiefDecisionDraft[suspect.id] ?? { decision: "approve", message: "" };

              return (
                <Card key={suspect.id} title={`Suspect #${suspect.id}: ${suspect.first_name} ${suspect.last_name}`}>
                  <div className="workflow-stack" style={{ gap: "0.85rem" }}>
                    <div className="workflow-grid">
                      <div>
                        <div className="workflow-kv__label">Status</div>
                        <div className="workflow-kv__value">
                          <span className={`status-pill status-pill--${statusTone}`}>
                            {formatWorkflowLabel(suspect.status)}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="workflow-kv__label">Proposed at</div>
                        <div className="workflow-kv__value">{formatDateTime(suspect.proposed_at)}</div>
                      </div>
                      <div>
                        <div className="workflow-kv__label">National ID</div>
                        <div className="workflow-kv__value">{suspect.national_id || "—"}</div>
                      </div>
                      <div>
                        <div className="workflow-kv__label">Phone</div>
                        <div className="workflow-kv__value">{suspect.phone || "—"}</div>
                      </div>
                    </div>

                    {suspect.notes && (
                      <div>
                        <div className="workflow-kv__label">Detective notes</div>
                        <div className="workflow-kv__value" style={{ whiteSpace: "pre-wrap" }}>
                          {suspect.notes}
                        </div>
                      </div>
                    )}

                    {suspect.sergeant_message && (
                      <div>
                        <div className="workflow-kv__label">Sergeant message</div>
                        <div className="workflow-kv__value" style={{ whiteSpace: "pre-wrap" }}>
                          {suspect.sergeant_message}
                        </div>
                      </div>
                    )}

                    <RoleGuard roles={["Sergeant"]}>
                      {suspect.status === "proposed" && (
                        <div className="workflow-fieldset">
                          <div className="workflow-fieldset__header">
                            <div>
                              <div className="workflow-kv__label">Sergeant review</div>
                              <div className="workflow-kv__value" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                                Approve or reject this suspect proposal.
                              </div>
                            </div>
                          </div>

                          <div className="workflow-actions">
                            <Button
                              type="button"
                              variant={review?.decision === "approve" ? "primary" : "secondary"}
                              onClick={() => {
                                ensureReviewDraft(suspect.id);
                                setReviewDrafts((prev) => ({
                                  ...prev,
                                  [suspect.id]: { decision: "approve", message: prev[suspect.id]?.message ?? "" }
                                }));
                              }}
                              disabled={reviewSubmitting[suspect.id]}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant={review?.decision === "reject" ? "primary" : "secondary"}
                              onClick={() => {
                                ensureReviewDraft(suspect.id);
                                setReviewDrafts((prev) => ({
                                  ...prev,
                                  [suspect.id]: { decision: "reject", message: prev[suspect.id]?.message ?? "" }
                                }));
                              }}
                              disabled={reviewSubmitting[suspect.id]}
                            >
                              Reject
                            </Button>
                          </div>

                          <div className="workflow-field">
                            <label className="ui-field__label">Message (optional)</label>
                            <textarea
                              className="ui-textarea"
                              value={review?.message ?? ""}
                              onChange={(e) => {
                                ensureReviewDraft(suspect.id);
                                const msg = e.target.value;
                                setReviewDrafts((prev) => ({
                                  ...prev,
                                  [suspect.id]: { decision: prev[suspect.id]?.decision ?? "approve", message: msg }
                                }));
                              }}
                              placeholder="Optional note for the detective…"
                              disabled={reviewSubmitting[suspect.id]}
                            />
                          </div>

                          <div className="workflow-actions">
                            <Button
                              type="button"
                              onClick={() => handleReview(suspect.id)}
                              disabled={!review || reviewSubmitting[suspect.id]}
                            >
                              {reviewSubmitting[suspect.id] ? "Submitting…" : "Submit review"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </RoleGuard>

                    {isApproved && (
                      <div className="workflow-fieldset">
                        <div className="workflow-fieldset__header">
                          <div>
                            <div className="workflow-kv__label">Interrogation</div>
                            <div className="workflow-kv__value" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                              Score this suspect and progress to captain/chief approval.
                            </div>
                          </div>
                        </div>

                        <div className="workflow-grid">
                          <div>
                            <div className="workflow-kv__label">Detective score</div>
                            <div className="workflow-kv__value">
                              {detectiveScore !== null ? (
                                <>
                                  <strong>{detectiveScore}</strong>
                                  <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                    {formatDateTime(interrogation?.detective_submitted_at)}
                                  </div>
                                </>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Sergeant score</div>
                            <div className="workflow-kv__value">
                              {sergeantScore !== null ? (
                                <>
                                  <strong>{sergeantScore}</strong>
                                  <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                    {formatDateTime(interrogation?.sergeant_submitted_at)}
                                  </div>
                                </>
                              ) : (
                                "—"
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Captain decision</div>
                            <div className="workflow-kv__value">
                              {captainDecision === null ? "—" : captainDecision ? "Approved" : "Rejected"}
                              {captainDecision !== null && (
                                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                  {formatDateTime(interrogation?.captain_decided_at)}
                                </div>
                              )}
                            </div>
                          </div>
                          {isCritical && (
                            <div>
                              <div className="workflow-kv__label">Chief decision</div>
                              <div className="workflow-kv__value">
                                {chiefDecision === null ? "—" : chiefDecision ? "Approved" : "Rejected"}
                                {chiefDecision !== null && (
                                  <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                    {formatDateTime(interrogation?.chief_reviewed_at)}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {canDetectiveScore && (
                          <div className="workflow-fieldset">
                            <div className="workflow-kv__label">Detective score submission</div>
                            <div className="workflow-actions">
                              <TextInput
                                label="Score (1..10)"
                                type="number"
                                min={1}
                                max={10}
                                value={detectiveScoreDraft[suspect.id] ?? ""}
                                onChange={(e) =>
                                  setDetectiveScoreDraft((prev) => ({ ...prev, [suspect.id]: e.target.value }))
                                }
                                disabled={submitting}
                              />
                              <Button type="button" onClick={() => handleDetectiveScore(suspect.id)} disabled={submitting}>
                                Submit
                              </Button>
                            </div>
                          </div>
                        )}

                        {canSergeantScore && (
                          <div className="workflow-fieldset">
                            <div className="workflow-kv__label">Sergeant score submission</div>
                            <div className="workflow-actions">
                              <TextInput
                                label="Score (1..10)"
                                type="number"
                                min={1}
                                max={10}
                                value={sergeantScoreDraft[suspect.id] ?? ""}
                                onChange={(e) =>
                                  setSergeantScoreDraft((prev) => ({ ...prev, [suspect.id]: e.target.value }))
                                }
                                disabled={submitting}
                              />
                              <Button type="button" onClick={() => handleSergeantScore(suspect.id)} disabled={submitting}>
                                Submit
                              </Button>
                            </div>
                          </div>
                        )}

                        {canCaptainDecide && (
                          <div className="workflow-fieldset">
                            <div className="workflow-kv__label">Captain final decision</div>
                            <div className="workflow-actions">
                              <Button
                                type="button"
                                variant={captainDraft.decision === "approve" ? "primary" : "secondary"}
                                onClick={() =>
                                  setCaptainDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: "approve", reasoning: prev[suspect.id]?.reasoning ?? "" }
                                  }))
                                }
                                disabled={submitting}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant={captainDraft.decision === "reject" ? "primary" : "secondary"}
                                onClick={() =>
                                  setCaptainDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: "reject", reasoning: prev[suspect.id]?.reasoning ?? "" }
                                  }))
                                }
                                disabled={submitting}
                              >
                                Reject
                              </Button>
                            </div>
                            <div className="workflow-field">
                              <label className="ui-field__label">Reasoning (optional)</label>
                              <textarea
                                className="ui-textarea"
                                value={captainDraft.reasoning}
                                onChange={(e) =>
                                  setCaptainDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: captainDraft.decision, reasoning: e.target.value }
                                  }))
                                }
                                disabled={submitting}
                                placeholder="Optional reasoning…"
                              />
                            </div>
                            <div className="workflow-actions">
                              <Button type="button" onClick={() => handleCaptainDecision(suspect.id)} disabled={submitting}>
                                Submit captain decision
                              </Button>
                            </div>
                          </div>
                        )}

                        {canChiefDecide && (
                          <div className="workflow-fieldset">
                            <div className="workflow-kv__label">Chief review (critical cases)</div>
                            <div className="workflow-actions">
                              <Button
                                type="button"
                                variant={chiefDraft.decision === "approve" ? "primary" : "secondary"}
                                onClick={() =>
                                  setChiefDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: "approve", message: prev[suspect.id]?.message ?? "" }
                                  }))
                                }
                                disabled={submitting}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                variant={chiefDraft.decision === "reject" ? "primary" : "secondary"}
                                onClick={() =>
                                  setChiefDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: "reject", message: prev[suspect.id]?.message ?? "" }
                                  }))
                                }
                                disabled={submitting}
                              >
                                Reject
                              </Button>
                            </div>
                            <div className="workflow-field">
                              <label className="ui-field__label">Message (optional)</label>
                              <textarea
                                className="ui-textarea"
                                value={chiefDraft.message}
                                onChange={(e) =>
                                  setChiefDecisionDraft((prev) => ({
                                    ...prev,
                                    [suspect.id]: { decision: chiefDraft.decision, message: e.target.value }
                                  }))
                                }
                                disabled={submitting}
                                placeholder="Optional message…"
                              />
                            </div>
                            <div className="workflow-actions">
                              <Button type="button" onClick={() => handleChiefDecision(suspect.id)} disabled={submitting}>
                                Submit chief decision
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};