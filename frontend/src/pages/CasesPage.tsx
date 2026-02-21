import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { CaseListItem, CaseStatus, listCases } from "../api/cases";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { formatWorkflowLabel } from "../utils/workflow";

function getStatusTone(status: CaseStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "closed") return "neutral";
  if (status === "active") return "success";
  return "warning";
}

export const CasesPage: React.FC = () => {
  const {
    data: cases,
    isLoading,
    error,
    refetch
  } = useAsyncData<CaseListItem[]>(listCases, []);

  const columns = useMemo<DataTableColumn<CaseListItem>[]>(
    () => [
      { key: "id", header: "ID" },
      { key: "title", header: "Title" },
      {
        key: "crime_level",
        header: "Crime level",
        render: (row) => formatWorkflowLabel(row.crime_level)
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <span className={`status-pill status-pill--${getStatusTone(row.status)}`}>
            {formatWorkflowLabel(row.status)}
          </span>
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
          <Link to={`/cases/${row.id}`}>
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
          <h1 style={{ marginTop: 0 }}>Cases</h1>
          <p className="workflow-muted">
            Browse accessible cases and open each case workspace to continue evidence and investigation flow.
          </p>
        </div>
        <BackToDashboardButton />
      </section>

      <Card title="Case list">
        {error && (
          <Alert
            variant="error"
            title="Failed to load cases"
            actions={
              <Button type="button" variant="secondary" onClick={refetch}>
                Retry
              </Button>
            }
          >
            The case list could not be loaded. Please try again.
          </Alert>
        )}

        {isLoading && <TableSkeleton rows={6} columns={6} />}

        {!isLoading && cases && <DataTable columns={columns} data={cases} emptyMessage="No cases available." />}
      </Card>
    </div>
  );
};
