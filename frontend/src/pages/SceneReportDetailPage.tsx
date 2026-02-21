import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { SceneReportDetail, approveSceneReport, getSceneReport } from "../api/sceneReports";
import { useAuthContext } from "../auth/AuthContext";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel, hasRoleKeyword } from "../utils/workflow";

function getStatusTone(status: SceneReportDetail["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  return "warning";
}

export const SceneReportDetailPage: React.FC = () => {
  const params = useParams();
  const sceneReportId = Number(params.sceneReportId);
  const isValidId = Number.isInteger(sceneReportId) && sceneReportId > 0;
  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();

  const {
    data: fetchedReport,
    isLoading,
    error,
    refetch
  } = useAsyncData<SceneReportDetail>(
    async () => {
      if (!isValidId) {
        throw new Error("Invalid scene report ID.");
      }
      return getSceneReport(sceneReportId);
    },
    [sceneReportId, isValidId]
  );

  const [report, setReport] = useState<SceneReportDetail | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    if (fetchedReport) {
      setReport(fetchedReport);
    }
  }, [fetchedReport]);

  const witnessColumns = useMemo<DataTableColumn<SceneReportDetail["witnesses"][number]>[]>(
    () => [
      { key: "phone", header: "Phone" },
      { key: "national_id", header: "National ID" }
    ],
    []
  );

  const canApproveRole = hasRoleKeyword(user?.roles, ["superior", "chief", "captain", "admin", "approve"]);
  const canApprove = !!(report && report.status === "pending" && canApproveRole);

  const handleApprove = async () => {
    if (!report) return;
    setApproveError(null);
    setIsApproving(true);

    try {
      const updated = await approveSceneReport(report.id);
      setReport(updated);
      showSuccess("Scene report approved and linked case activated.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not approve scene report.";
      setApproveError(message);
      showError(message);
    } finally {
      setIsApproving(false);
    }
  };

  if (!isValidId) {
    return (
      <Alert variant="error" title="Invalid scene report URL">
        The scene report ID is not valid. Return to the scene reports list.
      </Alert>
    );
  }

  if (isLoading && !report) {
    return <PageSkeleton />;
  }

  if (!report) {
    return (
      <Alert
        variant="error"
        title="Could not load scene report"
        actions={
          <Button type="button" variant="secondary" onClick={refetch}>
            Retry
          </Button>
        }
      >
        {error?.message ?? "Scene report detail is unavailable right now."}
      </Alert>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Scene Report #{report.id}</h1>
          <p className="workflow-muted">Review scene details, witness information, and approval state.</p>
        </div>
        <Link to="/scene-reports">
          <Button type="button" variant="secondary">
            Back to Scene Reports
          </Button>
        </Link>
      </section>

      <Card title="Overview">
        <div className="workflow-grid">
          <div>
            <div className="workflow-kv__label">Status</div>
            <div className="workflow-kv__value">
              <span className={`status-pill status-pill--${getStatusTone(report.status)}`}>
                {formatWorkflowLabel(report.status)}
              </span>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Scene datetime</div>
            <div className="workflow-kv__value">{formatDateTime(report.scene_datetime)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Created at</div>
            <div className="workflow-kv__value">{formatDateTime(report.created_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Approved at</div>
            <div className="workflow-kv__value">{formatDateTime(report.approved_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Case ID</div>
            <div className="workflow-kv__value">
              <Link className="workflow-link" to="/cases">
                Case #{report.case.id}
              </Link>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Case status</div>
            <div className="workflow-kv__value">{formatWorkflowLabel(String(report.case.status || "—"))}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Case title</div>
            <div className="workflow-kv__value">{String(report.case.title || "—")}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Crime level</div>
            <div className="workflow-kv__value">{formatWorkflowLabel(String(report.case.crime_level || "—"))}</div>
          </div>
        </div>
      </Card>

      <Card title="Case description">
        <p className="workflow-muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {String(report.case.description || "No description provided.")}
        </p>
      </Card>

      <Card title="Witnesses">
        <DataTable columns={witnessColumns} data={report.witnesses} emptyMessage="No witnesses were submitted." />
      </Card>

      {canApprove && (
        <Card title="Approval">
          {approveError && (
            <Alert variant="error" title="Approval failed">
              {approveError}
            </Alert>
          )}
          <p className="workflow-muted" style={{ marginTop: 0 }}>
            Approving this scene report will activate the linked case.
          </p>
          <div className="workflow-actions">
            <Button type="button" onClick={handleApprove} disabled={isApproving}>
              {isApproving ? "Approving..." : "Approve Scene Report"}
            </Button>
          </div>
        </Card>
      )}

      {report.status === "pending" && !canApprove && (
        <Alert variant="info" title="Pending approval">
          This report is pending and can be approved by users with scene report approval permission.
        </Alert>
      )}
    </div>
  );
};
