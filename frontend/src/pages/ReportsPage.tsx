import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CaseListItem, listCases } from "../api/cases";
import {
  BasicUser,
  CaseReportPayload,
  CaseReportSuspect,
  TrialVerdict,
  getCaseReport,
  submitTrialVerdict
} from "../api/caseReports";
import { ApiErrorAlert } from "../components/ui/ApiErrorAlert";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { Select } from "../components/ui/Select";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { resolveMediaUrl } from "../utils/media";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel, hasRoleKeyword } from "../utils/workflow";
import { useAuthContext } from "../auth/AuthContext";
import { EvidenceRecord } from "../api/evidence";

interface TrialFormDraft {
  verdict: TrialVerdict;
  punishment_title: string;
  punishment_description: string;
}

function parseCaseId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatUser(user: BasicUser | null): string {
  if (!user) return "—";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const primary = fullName || user.username;
  const roles = Array.isArray(user.roles) && user.roles.length > 0 ? ` [${user.roles.join(", ")}]` : "";
  return `${primary} (@${user.username})${roles}`;
}

function getSuspectStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "proposed") return "warning";
  return "neutral";
}

function getTrialPrerequisiteIssue(
  suspect: CaseReportSuspect,
  caseCrimeLevel: string
): string | null {
  if (suspect.status !== "approved") {
    return "Suspect must be approved before trial verdict can be submitted.";
  }
  if (!suspect.interrogation) {
    return "Interrogation record is required before trial.";
  }
  if (suspect.interrogation.captain_final_decision !== true) {
    return "Captain approval is required before trial.";
  }
  if (caseCrimeLevel.toLowerCase() === "critical" && suspect.interrogation.chief_decision !== true) {
    return "Chief approval is required for critical cases before trial.";
  }
  return null;
}

export const ReportsPage: React.FC = () => {
  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseFromQuery = parseCaseId(searchParams.get("case"));

  const [selectedCaseId, setSelectedCaseId] = useState<number | "">(caseFromQuery ?? "");
  const [trialDrafts, setTrialDrafts] = useState<Record<number, TrialFormDraft>>({});
  const [trialSubmitting, setTrialSubmitting] = useState<Record<number, boolean>>({});
  const [trialFormErrors, setTrialFormErrors] = useState<Record<number, string>>({});
  const canViewReports = hasRoleKeyword(user?.roles, ["judge", "captain", "chief"]);
  const isJudgeRole = hasRoleKeyword(user?.roles, ["judge"]);

  const {
    data: cases,
    isLoading: casesLoading,
    error: casesError,
    refetch: refetchCases
  } = useAsyncData<CaseListItem[]>(
    async () => {
      if (!canViewReports) return [];
      return listCases();
    },
    [canViewReports]
  );

  const {
    data: report,
    isLoading: reportLoading,
    error: reportError,
    refetch: refetchReport
  } = useAsyncData<CaseReportPayload | null>(
    async () => {
      if (!canViewReports || selectedCaseId === "") return null;
      return getCaseReport(selectedCaseId);
    },
    [selectedCaseId, canViewReports]
  );

  useEffect(() => {
    if (!report) return;
    const nextDrafts: Record<number, TrialFormDraft> = {};
    report.suspects.forEach((suspect) => {
      const latestTrial = suspect.trials && suspect.trials.length > 0 ? suspect.trials[0] : null;
      nextDrafts[suspect.id] = {
        verdict: latestTrial?.verdict ?? "innocent",
        punishment_title: latestTrial?.punishment_title ?? "",
        punishment_description: latestTrial?.punishment_description ?? ""
      };
    });
    setTrialDrafts(nextDrafts);
    setTrialFormErrors({});
  }, [report]);

  const caseOptions = useMemo(() => {
    const base = [{ value: "", label: "Select case" }];
    const list =
      cases?.map((caseItem) => ({
        value: String(caseItem.id),
        label: `#${caseItem.id} — ${caseItem.title}`
      })) ?? [];
    if (selectedCaseId !== "" && !list.some((option) => option.value === String(selectedCaseId))) {
      return [...base, { value: String(selectedCaseId), label: `#${selectedCaseId} — Selected case` }, ...list];
    }
    return [...base, ...list];
  }, [cases, selectedCaseId]);

  const evidenceColumns = useMemo<DataTableColumn<EvidenceRecord>[]>(
    () => [
      { key: "id", header: "ID" },
      {
        key: "type",
        header: "Type",
        render: (row) => <span className="status-pill status-pill--neutral">{formatWorkflowLabel(row.type)}</span>
      },
      { key: "title", header: "Title" },
      {
        key: "created_at",
        header: "Created",
        render: (row) => formatDateTime(row.created_at)
      },
      {
        key: "created_by",
        header: "Created by",
        render: (row) => row.created_by ?? "—"
      },
      {
        key: "attachments",
        header: "Attachments",
        render: (row) => {
          if (!row.attachments || row.attachments.length === 0) {
            return <span className="workflow-muted">No files</span>;
          }
          return (
            <div className="evidence-attachment-list">
              {row.attachments.map((attachment) => {
                const mediaUrl = resolveMediaUrl(attachment.file);
                if (!mediaUrl) {
                  return (
                    <span key={attachment.id} className="workflow-muted">
                      Attachment #{attachment.id}
                    </span>
                  );
                }
                return (
                  <a
                    key={attachment.id}
                    className="workflow-link"
                    href={mediaUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {formatWorkflowLabel(attachment.kind)} #{attachment.id}
                  </a>
                );
              })}
            </div>
          );
        }
      }
    ],
    []
  );

  const handleCaseChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) {
      setSelectedCaseId("");
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("case");
      setSearchParams(nextParams, { replace: true });
      return;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    setSelectedCaseId(parsed);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("case", String(parsed));
    setSearchParams(nextParams, { replace: true });
  };

  const updateTrialDraft = (suspectId: number, patch: Partial<TrialFormDraft>) => {
    setTrialDrafts((prev) => ({
      ...prev,
      [suspectId]: {
        verdict: "innocent",
        punishment_title: "",
        punishment_description: "",
        ...(prev[suspectId] ?? {}),
        ...patch
      }
    }));
    setTrialFormErrors((prev) => ({ ...prev, [suspectId]: "" }));
  };

  const handleSubmitTrial = async (suspect: CaseReportSuspect) => {
    if (!report) return;
    const draft = trialDrafts[suspect.id];
    if (!draft) return;

    const prerequisitesIssue = getTrialPrerequisiteIssue(suspect, report.case.crime_level);
    if (prerequisitesIssue) {
      setTrialFormErrors((prev) => ({ ...prev, [suspect.id]: prerequisitesIssue }));
      return;
    }

    if (draft.verdict === "guilty") {
      if (!draft.punishment_title.trim() || !draft.punishment_description.trim()) {
        setTrialFormErrors((prev) => ({
          ...prev,
          [suspect.id]: "Punishment title and punishment description are required when verdict is guilty."
        }));
        return;
      }
    }

    setTrialSubmitting((prev) => ({ ...prev, [suspect.id]: true }));
    setTrialFormErrors((prev) => ({ ...prev, [suspect.id]: "" }));

    try {
      await submitTrialVerdict(report.case.id, suspect.id, {
        verdict: draft.verdict,
        punishment_title: draft.verdict === "guilty" ? draft.punishment_title.trim() : undefined,
        punishment_description: draft.verdict === "guilty" ? draft.punishment_description.trim() : undefined
      });
      showSuccess(`Trial verdict submitted for suspect #${suspect.id}.`);
      await refetchReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit trial verdict.";
      setTrialFormErrors((prev) => ({ ...prev, [suspect.id]: message }));
      showError(message);
    } finally {
      setTrialSubmitting((prev) => ({ ...prev, [suspect.id]: false }));
    }
  };

  if (!canViewReports) {
    return (
      <div className="workflow-stack reports-page">
        <section className="workflow-header">
          <div>
            <h1 style={{ marginTop: 0 }}>General Reports</h1>
            <p className="workflow-muted">
              Access to this page is limited to Captain, Chief, and Judge roles.
            </p>
          </div>
          <BackToDashboardButton />
        </section>

        <Alert variant="error" title="Access denied">
          You do not have permission to view case reports.
        </Alert>
      </div>
    );
  }

  return (
    <div className="workflow-stack reports-page">
      <section className="workflow-header print-hidden">
        <div>
          <h1 style={{ marginTop: 0 }}>General Reports</h1>
          <p className="workflow-muted">
            Select a case to view the complete investigation report with complaint, scene, evidence, suspects,
            interrogation chain, and trial status.
          </p>
        </div>
        <div className="workflow-actions">
          <BackToDashboardButton />
          <Button type="button" variant="secondary" onClick={() => window.print()} disabled={!report}>
            Print Report
          </Button>
        </div>
      </section>

      <Card title="Report selection">
        <div className="workflow-panel-grid">
          <Select
            label="Case"
            value={selectedCaseId === "" ? "" : String(selectedCaseId)}
            onChange={handleCaseChange}
            options={caseOptions}
          />
          <div className="workflow-actions" style={{ alignItems: "end" }}>
            <Button type="button" variant="secondary" onClick={() => refetchCases()} disabled={casesLoading}>
              Refresh Cases
            </Button>
            <Button type="button" variant="secondary" onClick={() => refetchReport()} disabled={selectedCaseId === ""}>
              Refresh Report
            </Button>
          </div>
        </div>

        {casesError && (
          <div style={{ marginTop: "0.75rem" }}>
            <ApiErrorAlert title="Failed to load cases" error={casesError} onRetry={refetchCases} />
          </div>
        )}
      </Card>

      {!isJudgeRole && (
        <Alert variant="info" title="Report view mode">
          Trial verdict submission is only available for users with Judge role. You can still view full report details.
        </Alert>
      )}

      {selectedCaseId === "" && (
        <Alert variant="info" title="No case selected">
          Pick a case from the selector above to load the report.
        </Alert>
      )}

      {selectedCaseId !== "" && reportLoading && <PageSkeleton />}

      {selectedCaseId !== "" && reportError && (
        <ApiErrorAlert title="Failed to load case report" error={reportError} onRetry={refetchReport} />
      )}

      {report && (
        <>
          <Card title={`Case #${report.case.id} Summary`}>
            <div className="workflow-grid">
              <div>
                <div className="workflow-kv__label">Title</div>
                <div className="workflow-kv__value">{report.case.title}</div>
              </div>
              <div>
                <div className="workflow-kv__label">Status</div>
                <div className="workflow-kv__value">
                  <span className="status-pill status-pill--neutral">{formatWorkflowLabel(report.case.status)}</span>
                </div>
              </div>
              <div>
                <div className="workflow-kv__label">Crime level</div>
                <div className="workflow-kv__value">{formatWorkflowLabel(report.case.crime_level)}</div>
              </div>
              <div>
                <div className="workflow-kv__label">Created at</div>
                <div className="workflow-kv__value">{formatDateTime(report.case.created_at)}</div>
              </div>
              <div>
                <div className="workflow-kv__label">Formed at</div>
                <div className="workflow-kv__value">{formatDateTime(report.case.formed_at)}</div>
              </div>
              <div>
                <div className="workflow-kv__label">Assigned to (user ID)</div>
                <div className="workflow-kv__value">{report.case.assigned_to ?? "Unassigned"}</div>
              </div>
            </div>
            <div style={{ marginTop: "0.9rem" }}>
              <div className="workflow-kv__label">Description</div>
              <p className="workflow-muted" style={{ marginTop: "0.3rem", whiteSpace: "pre-wrap" }}>
                {report.case.description}
              </p>
            </div>
          </Card>

          <Card title="Complaint">
            {!report.complaint ? (
              <p className="workflow-muted" style={{ margin: 0 }}>
                No complaint linked to this case.
              </p>
            ) : (
              <div className="workflow-stack">
                <div className="workflow-grid">
                  <div>
                    <div className="workflow-kv__label">Complaint ID</div>
                    <div className="workflow-kv__value">#{report.complaint.id}</div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Status</div>
                    <div className="workflow-kv__value">
                      <span className="status-pill status-pill--neutral">
                        {formatWorkflowLabel(report.complaint.current_status)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Crime level</div>
                    <div className="workflow-kv__value">{formatWorkflowLabel(report.complaint.crime_level)}</div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Invalid attempts</div>
                    <div className="workflow-kv__value">{report.complaint.invalid_attempts}</div>
                  </div>
                </div>

                <div>
                  <div className="workflow-kv__label">Title</div>
                  <div className="workflow-kv__value">{report.complaint.title}</div>
                </div>
                <div>
                  <div className="workflow-kv__label">Description</div>
                  <p className="workflow-muted" style={{ marginTop: "0.3rem", whiteSpace: "pre-wrap" }}>
                    {report.complaint.description}
                  </p>
                </div>

                {(report.complaint.cadet_message || report.complaint.officer_message) && (
                  <div className="workflow-grid">
                    <div>
                      <div className="workflow-kv__label">Cadet message</div>
                      <div className="workflow-kv__value">{report.complaint.cadet_message || "—"}</div>
                    </div>
                    <div>
                      <div className="workflow-kv__label">Officer message</div>
                      <div className="workflow-kv__value">{report.complaint.officer_message || "—"}</div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="workflow-kv__label">Complainants</div>
                  <div className="workflow-list">
                    {report.complaint.complainants.map((entry) => (
                      <div key={entry.user_id} className="workflow-list__item">
                        User #{entry.user_id} - {formatWorkflowLabel(entry.status)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title="Scene Report">
            {!report.scene_report ? (
              <p className="workflow-muted" style={{ margin: 0 }}>
                No scene report linked to this case.
              </p>
            ) : (
              <div className="workflow-stack">
                <div className="workflow-grid">
                  <div>
                    <div className="workflow-kv__label">Scene report ID</div>
                    <div className="workflow-kv__value">#{report.scene_report.id}</div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Status</div>
                    <div className="workflow-kv__value">
                      <span className="status-pill status-pill--neutral">
                        {formatWorkflowLabel(report.scene_report.status)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Scene datetime</div>
                    <div className="workflow-kv__value">{formatDateTime(report.scene_report.scene_datetime)}</div>
                  </div>
                  <div>
                    <div className="workflow-kv__label">Approved at</div>
                    <div className="workflow-kv__value">{formatDateTime(report.scene_report.approved_at)}</div>
                  </div>
                </div>

                <div>
                  <div className="workflow-kv__label">Witnesses</div>
                  {report.scene_report.witnesses.length === 0 ? (
                    <p className="workflow-muted" style={{ margin: "0.3rem 0 0" }}>
                      No witnesses.
                    </p>
                  ) : (
                    <div className="workflow-list">
                      {report.scene_report.witnesses.map((witness, idx) => (
                        <div key={`${witness.phone}-${witness.national_id}-${idx}`} className="workflow-list__item">
                          {witness.phone} / {witness.national_id}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="Evidence">
            <DataTable
              columns={evidenceColumns}
              data={report.evidence}
              emptyMessage="No evidence entries linked to this case."
            />
          </Card>

          <Card title="Suspects, Interrogation, and Trials">
            {report.suspects.length === 0 ? (
              <p className="workflow-muted" style={{ margin: 0 }}>
                No suspects recorded for this case.
              </p>
            ) : (
              <div className="reports-suspect-grid">
                {report.suspects.map((suspect) => {
                  const trial = suspect.trials && suspect.trials.length > 0 ? suspect.trials[0] : null;
                  const interrogation = suspect.interrogation ?? null;
                  const prerequisitesIssue = getTrialPrerequisiteIssue(suspect, report.case.crime_level);
                  const draft = trialDrafts[suspect.id] ?? {
                    verdict: "innocent",
                    punishment_title: "",
                    punishment_description: ""
                  };
                  const formError = trialFormErrors[suspect.id] ?? "";

                  return (
                    <Card key={suspect.id} title={`Suspect #${suspect.id}: ${suspect.first_name} ${suspect.last_name}`}>
                      <div className="workflow-stack">
                        <div className="workflow-grid">
                          <div>
                            <div className="workflow-kv__label">Status</div>
                            <div className="workflow-kv__value">
                              <span className={`status-pill status-pill--${getSuspectStatusTone(suspect.status)}`}>
                                {formatWorkflowLabel(suspect.status)}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">National ID</div>
                            <div className="workflow-kv__value">{suspect.national_id || "—"}</div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Phone</div>
                            <div className="workflow-kv__value">{suspect.phone || "—"}</div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Proposed at</div>
                            <div className="workflow-kv__value">{formatDateTime(suspect.proposed_at)}</div>
                          </div>
                        </div>

                        <div>
                          <div className="workflow-kv__label">Notes</div>
                          <p className="workflow-muted" style={{ marginTop: "0.3rem", whiteSpace: "pre-wrap" }}>
                            {suspect.notes || "—"}
                          </p>
                        </div>

                        <div className="workflow-grid">
                          <div>
                            <div className="workflow-kv__label">Detective score</div>
                            <div className="workflow-kv__value">{interrogation?.detective_score ?? "—"}</div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Sergeant score</div>
                            <div className="workflow-kv__value">{interrogation?.sergeant_score ?? "—"}</div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Captain decision</div>
                            <div className="workflow-kv__value">
                              {interrogation?.captain_final_decision === null
                                ? "—"
                                : interrogation?.captain_final_decision
                                  ? "Approved"
                                  : "Rejected"}
                            </div>
                          </div>
                          <div>
                            <div className="workflow-kv__label">Chief decision</div>
                            <div className="workflow-kv__value">
                              {interrogation?.chief_decision === null
                                ? "—"
                                : interrogation?.chief_decision
                                  ? "Approved"
                                  : "Rejected"}
                            </div>
                          </div>
                        </div>

                        <div className="reports-trial-block">
                          <div className="workflow-kv__label">Existing trial verdict</div>
                          {trial ? (
                            <div className="workflow-stack" style={{ gap: "0.35rem" }}>
                              <div className="workflow-kv__value">
                                Verdict:{" "}
                                <strong>{trial.verdict ? formatWorkflowLabel(trial.verdict) : "Not decided"}</strong>
                              </div>
                              <div className="workflow-muted">Verdict at: {formatDateTime(trial.verdict_at)}</div>
                              {trial.verdict === "guilty" && (
                                <div className="workflow-muted">
                                  Punishment: {trial.punishment_title || "—"} / {trial.punishment_description || "—"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="workflow-muted">No trial record yet.</div>
                          )}
                        </div>

                        {isJudgeRole ? (
                          <div className="reports-trial-block print-hidden">
                            <div className="workflow-kv__label">Judge Trial Verdict</div>
                            {prerequisitesIssue ? (
                              <Alert variant="warning" title="Prerequisites not satisfied">
                                {prerequisitesIssue}
                              </Alert>
                            ) : (
                              <div className="workflow-form">
                                <Select
                                  label="Verdict"
                                  value={draft.verdict}
                                  onChange={(event) =>
                                    updateTrialDraft(suspect.id, { verdict: event.target.value as TrialVerdict })
                                  }
                                  options={[
                                    { value: "innocent", label: "Innocent" },
                                    { value: "guilty", label: "Guilty" }
                                  ]}
                                />

                                {draft.verdict === "guilty" && (
                                  <>
                                    <TextInput
                                      label="Punishment title"
                                      value={draft.punishment_title}
                                      onChange={(event) =>
                                        updateTrialDraft(suspect.id, { punishment_title: event.target.value })
                                      }
                                    />
                                    <div className="workflow-field">
                                      <label className="ui-field__label" htmlFor={`punishment-description-${suspect.id}`}>
                                        Punishment description
                                      </label>
                                      <textarea
                                        id={`punishment-description-${suspect.id}`}
                                        className="ui-textarea"
                                        rows={4}
                                        value={draft.punishment_description}
                                        onChange={(event) =>
                                          updateTrialDraft(suspect.id, { punishment_description: event.target.value })
                                        }
                                      />
                                    </div>
                                  </>
                                )}

                                {formError ? (
                                  <Alert variant="error" title="Could not submit verdict">
                                    {formError}
                                  </Alert>
                                ) : null}

                                <div className="workflow-actions">
                                  <Button
                                    type="button"
                                    onClick={() => handleSubmitTrial(suspect)}
                                    disabled={trialSubmitting[suspect.id]}
                                  >
                                    {trialSubmitting[suspect.id] ? "Submitting..." : "Submit Verdict"}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Involved Police (Roles)">
            <div className="workflow-grid">
              <div>
                <div className="workflow-kv__label">Case creator</div>
                <div className="workflow-kv__value">{formatUser(report.police_involved.created_by)}</div>
              </div>
              <div>
                <div className="workflow-kv__label">Assigned officer</div>
                <div className="workflow-kv__value">{formatUser(report.police_involved.assigned_to)}</div>
              </div>
            </div>

            <div className="workflow-panel-grid" style={{ marginTop: "0.85rem" }}>
              <div className="reports-police-box">
                <div className="workflow-kv__label">Complaint review chain</div>
                {!report.police_involved.complaint_review ? (
                  <div className="workflow-muted">No complaint review data.</div>
                ) : (
                  <div className="workflow-stack" style={{ gap: "0.4rem" }}>
                    <div className="workflow-muted">
                      Status: {formatWorkflowLabel(report.police_involved.complaint_review.current_status)}
                    </div>
                    <div className="workflow-muted">
                      Cadet reviewer: {formatUser(report.police_involved.complaint_review.cadet_reviewed_by)}
                    </div>
                    <div className="workflow-muted">
                      Officer reviewer: {formatUser(report.police_involved.complaint_review.officer_reviewed_by)}
                    </div>
                    <div className="workflow-muted">
                      Cadet message: {report.police_involved.complaint_review.cadet_message || "—"}
                    </div>
                    <div className="workflow-muted">
                      Officer message: {report.police_involved.complaint_review.officer_message || "—"}
                    </div>
                  </div>
                )}
              </div>

              <div className="reports-police-box">
                <div className="workflow-kv__label">Scene report approval chain</div>
                {!report.police_involved.scene_report ? (
                  <div className="workflow-muted">No scene report approval data.</div>
                ) : (
                  <div className="workflow-stack" style={{ gap: "0.4rem" }}>
                    <div className="workflow-muted">
                      Status: {formatWorkflowLabel(report.police_involved.scene_report.status)}
                    </div>
                    <div className="workflow-muted">
                      Created by: {formatUser(report.police_involved.scene_report.created_by)}
                    </div>
                    <div className="workflow-muted">
                      Approved by: {formatUser(report.police_involved.scene_report.approved_by)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="print-hidden">
            <Alert variant="info" title="Quick links">
              Continue investigation from{" "}
              <Link className="workflow-link" to={`/cases/${report.case.id}`}>
                case workspace
              </Link>{" "}
              or{" "}
              <Link className="workflow-link" to={`/cases/${report.case.id}/suspects`}>
                suspects & interrogation
              </Link>
              .
            </Alert>
          </div>
        </>
      )}
    </div>
  );
};
