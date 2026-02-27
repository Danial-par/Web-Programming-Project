import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CaseDetail,
  getCase,
  assignCaseDetective,
  listCaseWitnesses,
  addCaseWitness,
  removeCaseWitness,
  CaseWitness
} from "../api/cases";
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

  const [witnessUserIdInput, setWitnessUserIdInput] = useState("");
  const [witnessNationalIdInput, setWitnessNationalIdInput] = useState("");
  const [isUpdatingWitnesses, setIsUpdatingWitnesses] = useState(false);

  const {
    data: witnesses,
    isLoading: isWitnessLoading,
    error: witnessError,
    refetch: refetchWitnesses
  } = useAsyncData<CaseWitness[]>(
    async () => {
      if (!isValidId) return [];
      return listCaseWitnesses(caseId);
    },
    [caseId, isValidId]
  );

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

  const handleAddWitness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseDetail) return;

    const userIdTrimmed = witnessUserIdInput.trim();
    const nidTrimmed = witnessNationalIdInput.trim();

    if (!userIdTrimmed && !nidTrimmed) {
      showError("Provide witness user ID or national ID.");
      return;
    }

    const payload: { user_id?: number; national_id?: string } = {};

    if (userIdTrimmed) {
      const numericId = Number(userIdTrimmed);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        showError("Witness user ID must be a positive integer.");
        return;
      }
      payload.user_id = numericId;
    } else {
      payload.national_id = nidTrimmed;
    }

    setIsUpdatingWitnesses(true);
    try {
      await addCaseWitness(caseDetail.id, payload);
      showSuccess("Witness added to case.");
      setWitnessUserIdInput("");
      setWitnessNationalIdInput("");
      await refetchWitnesses();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add witness.");
    } finally {
      setIsUpdatingWitnesses(false);
    }
  };

  const handleRemoveWitness = async (userId: number) => {
    if (!caseDetail) return;
    setIsUpdatingWitnesses(true);
    try {
      await removeCaseWitness(caseDetail.id, userId);
      showSuccess("Witness removed.");
      await refetchWitnesses();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to remove witness.");
    } finally {
      setIsUpdatingWitnesses(false);
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

      <RoleGuard roles={["Captain", "Chief", "Admin", "Sergeant", "Detective"]}>
        <Card title="Witnesses">
          <p className="workflow-muted" style={{ marginTop: 0 }}>
            Add a registered user as a witness on this case (so they can submit witness evidence for this case).
          </p>

          <form
            onSubmit={handleAddWitness}
            style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <div className="workflow-field">
              <label className="ui-field__label" htmlFor="witness-user-id">
                Witness user ID (optional)
              </label>
              <input
                id="witness-user-id"
                className="ui-input"
                placeholder="e.g. 42"
                value={witnessUserIdInput}
                onChange={(e) => setWitnessUserIdInput(e.target.value)}
              />
            </div>

            <div className="workflow-field">
              <label className="ui-field__label" htmlFor="witness-national-id">
                Witness national ID (optional)
              </label>
              <input
                id="witness-national-id"
                className="ui-input"
                placeholder="e.g. 1234567890"
                value={witnessNationalIdInput}
                onChange={(e) => setWitnessNationalIdInput(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={isUpdatingWitnesses}>
              {isUpdatingWitnesses ? "Saving..." : "Add witness"}
            </Button>
          </form>

          <div style={{ marginTop: "1rem" }}>
            {isWitnessLoading ? (
              <div className="workflow-muted">Loading witnesses...</div>
            ) : witnessError ? (
              <Alert
                variant="error"
                title="Failed to load witnesses"
                actions={
                  <Button type="button" variant="secondary" onClick={refetchWitnesses}>
                    Retry
                  </Button>
                }
              >
                {witnessError.message}
              </Alert>
            ) : !witnesses || witnesses.length === 0 ? (
              <div className="workflow-muted">No witnesses registered for this case.</div>
            ) : (
              <div className="workflow-stack" style={{ gap: "0.5rem" }}>
                {witnesses.map((w) => (
                  <div key={w.user_id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{w.username} (ID: {w.user_id})</div>
                      <div className="workflow-muted" style={{ fontSize: "0.9rem" }}>
                        NID: {w.national_id || "—"} · Phone: {w.phone || "—"} · Email: {w.email || "—"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isUpdatingWitnesses}
                      onClick={() => handleRemoveWitness(w.user_id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </RoleGuard>

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
