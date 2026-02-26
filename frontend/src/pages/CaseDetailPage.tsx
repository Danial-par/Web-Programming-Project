import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CaseDetail, getCase, assignCaseDetective } from "../api/cases";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { formatWorkflowLabel } from "../utils/workflow";
import { useAuthContext } from "../auth/AuthContext";
import { RoleGuard } from "../auth/rbac";
import { useToast } from "../utils/toast";

export const CaseDetailPage: React.FC = () => {
  const params = useParams();
  const caseId = Number(params.caseId);
  const isValidId = Number.isInteger(caseId) && caseId > 0;

  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();
  const [detectiveIdInput, setDetectiveIdInput] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const {
    data: caseDetail,
    isLoading,
    error,
    refetch
  } = useAsyncData<CaseDetail>(
    async () => {
      if (!isValidId) {
        throw new Error("Invalid case ID.");
      }
      return getCase(caseId);
    },
    [caseId, isValidId]
  );

  if (!isValidId) {
    return (
      <Alert variant="error" title="Invalid case URL">
        This case ID is not valid. Return to the cases list and open a valid case.
      </Alert>
    );
  }

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!caseDetail) {
    return (
      <Alert
        variant="error"
        title="Failed to load case details"
        actions={
          <Button type="button" variant="secondary" onClick={refetch}>
            Retry
          </Button>
        }
      >
        {error?.message ?? "The case detail endpoint returned no data."}
      </Alert>
    );
  }

  const handleAssignDetective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseDetail) return;

    const trimmed = detectiveIdInput.trim();
    if (!trimmed) {
      showError("Detective user ID is required.");
      return;
    }

    const numericId = Number(trimmed);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      showError("Detective user ID must be a positive integer.");
      return;
    }

    setIsAssigning(true);
    try {
      await assignCaseDetective(caseDetail.id, numericId);
      showSuccess("Detective assigned to case.");
      setDetectiveIdInput("");
      await refetch();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to assign detective.");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Case #{caseDetail.id}</h1>
          <p className="workflow-muted">Case workspace with quick links to evidence, board, and suspect flow.</p>
        </div>
        <div className="workflow-actions">
          <Link to="/cases">
            <Button type="button" variant="secondary">
              Back to Cases
            </Button>
          </Link>
        </div>
      </section>

      <Card title="Core information">
        <div className="workflow-grid">
          <div>
            <div className="workflow-kv__label">Title</div>
            <div className="workflow-kv__value">{caseDetail.title}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Status</div>
            <div className="workflow-kv__value">
              <span className="status-pill status-pill--neutral">{formatWorkflowLabel(caseDetail.status)}</span>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Crime level</div>
            <div className="workflow-kv__value">{formatWorkflowLabel(caseDetail.crime_level)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Created at</div>
            <div className="workflow-kv__value">{formatDateTime(caseDetail.created_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Formed at</div>
            <div className="workflow-kv__value">{formatDateTime(caseDetail.formed_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Created by user ID</div>
            <div className="workflow-kv__value">{caseDetail.created_by ?? "—"}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Assigned detective user ID</div>
            <div className="workflow-kv__value">{caseDetail.assigned_to ?? "Unassigned"}</div>
          </div>
        </div>

        <RoleGuard roles={["Captain", "Chief", "Admin"]}>
          <form
            onSubmit={handleAssignDetective}
            style={{
              marginTop: "1.25rem",
              display: "flex",
              gap: "0.75rem",
              alignItems: "flex-end",
              flexWrap: "wrap"
            }}
          >
            <div className="workflow-field">
              <label className="ui-field__label" htmlFor="detective-id">
                Assign detective user ID
              </label>
              <input
                id="detective-id"
                name="detective-id"
                className="ui-input"
                placeholder="Enter detective user ID (Detective role)"
                value={detectiveIdInput}
                onChange={(e) => setDetectiveIdInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isAssigning}>
              {isAssigning ? "Assigning..." : "Assign detective"}
            </Button>
          </form>
        </RoleGuard>

        <div style={{ marginTop: "1rem" }}>
          <div className="workflow-kv__label">Description</div>
          <p className="workflow-muted" style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
            {caseDetail.description}
          </p>
        </div>
      </Card>

      <Card title="Investigation links">
        <div className="workflow-actions">
          <Link to={`/evidence?case=${caseDetail.id}`}>
            <Button type="button">Open Evidence for This Case</Button>
          </Link>
          <Link to={`/board/${caseDetail.id}`}>
            <Button type="button" variant="secondary">
              Open Detective Board
            </Button>
          </Link>
          <Link to={`/cases/${caseDetail.id}/suspects`}>
            <Button type="button" variant="secondary">
              Suspects & Interrogation
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};
