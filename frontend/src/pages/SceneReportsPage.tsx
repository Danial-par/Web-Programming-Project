import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { SceneReportListItem, listSceneReports } from "../api/sceneReports";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { formatWorkflowLabel } from "../utils/workflow";

function getStatusTone(status: SceneReportListItem["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  return "warning";
}

export const SceneReportsPage: React.FC = () => {
  const {
    data: sceneReports,
    isLoading,
    error,
    refetch
  } = useAsyncData<SceneReportListItem[]>(listSceneReports, []);

  const columns = useMemo<DataTableColumn<SceneReportListItem>[]>(
    () => [
      { key: "id", header: "ID" },
      {
        key: "case_id",
        header: "Case",
        render: (row) => (
          <Link className="workflow-link" to="/cases">
            Case #{row.case_id}
          </Link>
        )
      },
      {
        key: "scene_datetime",
        header: "Scene datetime",
        render: (row) => formatDateTime(row.scene_datetime)
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <span className={`status-pill status-pill--${getStatusTone(row.status)}`}>{formatWorkflowLabel(row.status)}</span>
        )
      },
      {
        key: "created_at",
        header: "Created",
        render: (row) => formatDateTime(row.created_at)
      },
      {
        key: "id",
        header: "Action",
        render: (row) => (
          <Link to={`/scene-reports/${row.id}`}>
            <Button variant="secondary" type="button">
              Open
            </Button>
          </Link>
        )
      }
    ],
    []
  );

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Scene Reports</h1>
          <p className="workflow-muted">
            Create incident scene reports, track approval status, and monitor linked case formation.
          </p>
        </div>
        <div className="workflow-actions">
          <BackToDashboardButton />
          <Link to="/scene-reports/new">
            <Button type="button">New Scene Report</Button>
          </Link>
        </div>
      </section>

      <Card title="Scene report list">
        {error && (
          <Alert
            variant="error"
            title="Failed to load scene reports"
            actions={
              <Button type="button" variant="secondary" onClick={refetch}>
                Retry
              </Button>
            }
          >
            The list endpoint returned an error. Please try again.
          </Alert>
        )}

        {isLoading && <TableSkeleton rows={6} columns={6} />}

        {!isLoading && sceneReports && (
          <DataTable
            columns={columns}
            data={sceneReports}
            emptyMessage="No scene reports available for your account."
          />
        )}
      </Card>
    </div>
  );
};
