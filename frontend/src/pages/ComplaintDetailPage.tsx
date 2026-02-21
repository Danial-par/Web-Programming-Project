import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  CadetReviewPayload,
  ComplaintDetail,
  ComplaintResubmitPayload,
  ComplaintStatus,
  CrimeLevel,
  OfficerReviewPayload,
  cadetReviewComplaint,
  getComplaint,
  officerReviewComplaint,
  resubmitComplaint
} from "../api/complaints";
import { useAuthContext } from "../auth/AuthContext";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { Select } from "../components/ui/Select";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel, hasRoleKeyword, parseIdList } from "../utils/workflow";

const CRIME_LEVEL_OPTIONS: Array<{ value: CrimeLevel; label: string }> = [
  { value: "level_3", label: "Level 3" },
  { value: "level_2", label: "Level 2" },
  { value: "level_1", label: "Level 1" },
  { value: "critical", label: "Critical" }
];

function getStatusTone(status: ComplaintStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "officer_approved") return "success";
  if (status === "cadet_rejected" || status === "officer_rejected") return "warning";
  if (status === "invalid") return "danger";
  return "neutral";
}

function parseIdInput(raw: string): number[] | null {
  if (!raw.trim()) return [];
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const parsed = parseIdList(raw);
  if (parsed.length !== parts.length) return null;
  return parsed;
}

export const ComplaintDetailPage: React.FC = () => {
  const params = useParams();
  const complaintId = Number(params.complaintId);
  const isValidId = Number.isInteger(complaintId) && complaintId > 0;
  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();

  const {
    data: fetchedComplaint,
    isLoading,
    error,
    refetch
  } = useAsyncData<ComplaintDetail>(
    async () => {
      if (!isValidId) {
        throw new Error("Invalid complaint ID.");
      }
      return getComplaint(complaintId);
    },
    [complaintId, isValidId]
  );

  const [complaint, setComplaint] = useState<ComplaintDetail | null>(null);
  const [resubmitForm, setResubmitForm] = useState({
    title: "",
    description: "",
    crime_level: "level_3" as CrimeLevel
  });
  const [cadetForm, setCadetForm] = useState({
    decision: "approve" as "approve" | "reject",
    message: "",
    approveIds: "",
    rejectIds: ""
  });
  const [officerForm, setOfficerForm] = useState({
    decision: "approve" as "approve" | "reject",
    message: ""
  });

  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [cadetError, setCadetError] = useState<string | null>(null);
  const [officerError, setOfficerError] = useState<string | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [isCadetSubmitting, setIsCadetSubmitting] = useState(false);
  const [isOfficerSubmitting, setIsOfficerSubmitting] = useState(false);

  useEffect(() => {
    if (!fetchedComplaint) return;
    setComplaint(fetchedComplaint);
    setResubmitForm({
      title: fetchedComplaint.title,
      description: fetchedComplaint.description,
      crime_level: fetchedComplaint.crime_level
    });
  }, [fetchedComplaint]);

  const complainantColumns = useMemo<DataTableColumn<ComplaintDetail["complainants"][number]>[]>(
    () => [
      { key: "user_id", header: "User ID" },
      {
        key: "status",
        header: "Status",
        render: (row) => <span className="status-pill status-pill--neutral">{formatWorkflowLabel(row.status)}</span>
      }
    ],
    []
  );

  const isCreator = !!(user && complaint && user.id === complaint.created_by);
  const isCadetRole = hasRoleKeyword(user?.roles, ["cadet"]);
  const isOfficerRole = hasRoleKeyword(user?.roles, ["officer"]);

  const canResubmit = !!(
    complaint &&
    isCreator &&
    complaint.current_status === "cadet_rejected" &&
    complaint.invalid_attempts < 3
  );
  const canCadetReview = !!(
    complaint &&
    isCadetRole &&
    (complaint.current_status === "submitted" || complaint.current_status === "officer_rejected")
  );
  const canOfficerReview = !!(complaint && isOfficerRole && complaint.current_status === "cadet_approved");

  const handleResubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complaint) return;
    setResubmitError(null);
    setIsResubmitting(true);

    const payload: ComplaintResubmitPayload = {};
    const trimmedTitle = resubmitForm.title.trim();
    const trimmedDescription = resubmitForm.description.trim();
    if (trimmedTitle && trimmedTitle !== complaint.title) payload.title = trimmedTitle;
    if (trimmedDescription && trimmedDescription !== complaint.description) payload.description = trimmedDescription;
    if (resubmitForm.crime_level !== complaint.crime_level) payload.crime_level = resubmitForm.crime_level;

    try {
      const updated = await resubmitComplaint(complaint.id, payload);
      setComplaint(updated);
      showSuccess("Complaint resubmitted.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not resubmit complaint.";
      setResubmitError(message);
      showError(message);
    } finally {
      setIsResubmitting(false);
    }
  };

  const handleCadetReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complaint) return;
    setCadetError(null);

    if (cadetForm.decision === "reject" && !cadetForm.message.trim()) {
      setCadetError("Message is required when rejecting a complaint.");
      return;
    }

    const approveIds = parseIdInput(cadetForm.approveIds);
    if (approveIds === null) {
      setCadetError("Approve complainant IDs must be comma-separated positive numbers.");
      return;
    }
    const rejectIds = parseIdInput(cadetForm.rejectIds);
    if (rejectIds === null) {
      setCadetError("Reject complainant IDs must be comma-separated positive numbers.");
      return;
    }

    const payload: CadetReviewPayload = {
      decision: cadetForm.decision
    };
    if (cadetForm.message.trim()) payload.message = cadetForm.message.trim();
    if (approveIds.length > 0) payload.approve_complainant_ids = approveIds;
    if (rejectIds.length > 0) payload.reject_complainant_ids = rejectIds;

    setIsCadetSubmitting(true);
    try {
      const updated = await cadetReviewComplaint(complaint.id, payload);
      setComplaint(updated);
      showSuccess("Cadet review submitted.");
      if (cadetForm.decision === "approve") {
        setCadetForm((prev) => ({ ...prev, message: "", approveIds: "", rejectIds: "" }));
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not submit cadet review.";
      setCadetError(message);
      showError(message);
    } finally {
      setIsCadetSubmitting(false);
    }
  };

  const handleOfficerReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complaint) return;
    setOfficerError(null);

    if (officerForm.decision === "reject" && !officerForm.message.trim()) {
      setOfficerError("Message is required when rejecting a complaint.");
      return;
    }

    const payload: OfficerReviewPayload = {
      decision: officerForm.decision
    };
    if (officerForm.message.trim()) payload.message = officerForm.message.trim();

    setIsOfficerSubmitting(true);
    try {
      const updated = await officerReviewComplaint(complaint.id, payload);
      setComplaint(updated);
      showSuccess("Officer review submitted.");
      if (officerForm.decision === "approve") {
        setOfficerForm({ decision: "approve", message: "" });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not submit officer review.";
      setOfficerError(message);
      showError(message);
    } finally {
      setIsOfficerSubmitting(false);
    }
  };

  if (!isValidId) {
    return (
      <Alert variant="error" title="Invalid complaint URL">
        The complaint ID is not valid. Return to the complaint list and try again.
      </Alert>
    );
  }

  if (isLoading && !complaint) {
    return <PageSkeleton />;
  }

  if (!complaint) {
    return (
      <Alert
        variant="error"
        title="Could not load complaint"
        actions={
          <Button type="button" variant="secondary" onClick={refetch}>
            Retry
          </Button>
        }
      >
        {error?.message ?? "The complaint detail is unavailable right now."}
      </Alert>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Complaint #{complaint.id}</h1>
          <p className="workflow-muted">Status-driven complaint workflow with creator, cadet, and officer actions.</p>
        </div>
        <Link to="/complaints">
          <Button type="button" variant="secondary">
            Back to Complaints
          </Button>
        </Link>
      </section>

      <Card title="Overview">
        <div className="workflow-grid">
          <div>
            <div className="workflow-kv__label">Title</div>
            <div className="workflow-kv__value">{complaint.title}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Status</div>
            <div className="workflow-kv__value">
              <span className={`status-pill status-pill--${getStatusTone(complaint.current_status)}`}>
                {formatWorkflowLabel(complaint.current_status)}
              </span>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Crime level</div>
            <div className="workflow-kv__value">{formatWorkflowLabel(complaint.crime_level)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Invalid attempts</div>
            <div className="workflow-kv__value">{complaint.invalid_attempts}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Submitted</div>
            <div className="workflow-kv__value">{formatDateTime(complaint.submitted_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Updated</div>
            <div className="workflow-kv__value">{formatDateTime(complaint.updated_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Case ID</div>
            <div className="workflow-kv__value">
              {complaint.case_id ? (
                <Link className="workflow-link" to={`/cases`}>
                  Case #{complaint.case_id}
                </Link>
              ) : (
                "Not created yet"
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <div className="workflow-kv__label">Description</div>
          <p className="workflow-muted" style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
            {complaint.description}
          </p>
        </div>
      </Card>

      {(complaint.cadet_message || complaint.officer_message) && (
        <Card title="Review messages">
          {complaint.cadet_message && (
            <Alert variant="warning" title="Cadet message">
              {complaint.cadet_message}
            </Alert>
          )}
          {complaint.officer_message && (
            <div style={{ marginTop: complaint.cadet_message ? "0.75rem" : 0 }}>
              <Alert variant="warning" title="Officer message">
                {complaint.officer_message}
              </Alert>
            </div>
          )}
        </Card>
      )}

      <Card title="Complainants">
        <DataTable
          columns={complainantColumns}
          data={complaint.complainants}
          emptyMessage="No complainants listed for this complaint."
        />
      </Card>

      <div className="workflow-panel-grid">
        {canResubmit && (
          <Card title="Creator action: resubmit">
            <form className="workflow-form" onSubmit={handleResubmit}>
              <TextInput
                label="Title"
                value={resubmitForm.title}
                onChange={(event) => setResubmitForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <div className="workflow-field">
                <label className="ui-field__label" htmlFor="resubmit-description">
                  Description
                </label>
                <textarea
                  id="resubmit-description"
                  className="ui-textarea"
                  rows={4}
                  value={resubmitForm.description}
                  onChange={(event) => setResubmitForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <Select
                label="Crime level"
                value={resubmitForm.crime_level}
                onChange={(event) =>
                  setResubmitForm((prev) => ({ ...prev, crime_level: event.target.value as CrimeLevel }))
                }
                options={CRIME_LEVEL_OPTIONS}
              />
              {resubmitError && (
                <Alert variant="error" title="Resubmit failed">
                  {resubmitError}
                </Alert>
              )}
              <div className="workflow-actions">
                <Button type="submit" disabled={isResubmitting}>
                  {isResubmitting ? "Submitting..." : "Resubmit Complaint"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {canCadetReview && (
          <Card title="Cadet review">
            <form className="workflow-form" onSubmit={handleCadetReview}>
              <Select
                label="Decision"
                value={cadetForm.decision}
                onChange={(event) =>
                  setCadetForm((prev) => ({ ...prev, decision: event.target.value as "approve" | "reject" }))
                }
                options={[
                  { value: "approve", label: "Approve" },
                  { value: "reject", label: "Reject" }
                ]}
              />
              <div className="workflow-field">
                <label className="ui-field__label" htmlFor="cadet-message">
                  Message {cadetForm.decision === "reject" ? "(required)" : "(optional)"}
                </label>
                <textarea
                  id="cadet-message"
                  className="ui-textarea"
                  rows={3}
                  value={cadetForm.message}
                  onChange={(event) => setCadetForm((prev) => ({ ...prev, message: event.target.value }))}
                />
              </div>
              <TextInput
                label="Approve complainant IDs (optional)"
                value={cadetForm.approveIds}
                onChange={(event) => setCadetForm((prev) => ({ ...prev, approveIds: event.target.value }))}
                placeholder="Example: 10, 12"
              />
              <TextInput
                label="Reject complainant IDs (optional)"
                value={cadetForm.rejectIds}
                onChange={(event) => setCadetForm((prev) => ({ ...prev, rejectIds: event.target.value }))}
                placeholder="Example: 15, 18"
              />
              {cadetError && (
                <Alert variant="error" title="Cadet review failed">
                  {cadetError}
                </Alert>
              )}
              <div className="workflow-actions">
                <Button type="submit" disabled={isCadetSubmitting}>
                  {isCadetSubmitting ? "Submitting..." : "Submit Cadet Review"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {canOfficerReview && (
          <Card title="Officer review">
            <form className="workflow-form" onSubmit={handleOfficerReview}>
              <Select
                label="Decision"
                value={officerForm.decision}
                onChange={(event) =>
                  setOfficerForm((prev) => ({ ...prev, decision: event.target.value as "approve" | "reject" }))
                }
                options={[
                  { value: "approve", label: "Approve" },
                  { value: "reject", label: "Reject" }
                ]}
              />
              <div className="workflow-field">
                <label className="ui-field__label" htmlFor="officer-message">
                  Message {officerForm.decision === "reject" ? "(required)" : "(optional)"}
                </label>
                <textarea
                  id="officer-message"
                  className="ui-textarea"
                  rows={3}
                  value={officerForm.message}
                  onChange={(event) => setOfficerForm((prev) => ({ ...prev, message: event.target.value }))}
                />
              </div>
              {officerError && (
                <Alert variant="error" title="Officer review failed">
                  {officerError}
                </Alert>
              )}
              <div className="workflow-actions">
                <Button type="submit" disabled={isOfficerSubmitting}>
                  {isOfficerSubmitting ? "Submitting..." : "Submit Officer Review"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      {!canResubmit && !canCadetReview && !canOfficerReview && (
        <Alert variant="info" title="No actions available">
          You can view the workflow details, but no action is available for your current role or this complaint state.
        </Alert>
      )}
    </div>
  );
};
