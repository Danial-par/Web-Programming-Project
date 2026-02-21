import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  ComplaintCreatePayload,
  ComplaintListItem,
  ComplaintStatus,
  CrimeLevel,
  createComplaint,
  listComplaints
} from "../api/complaints";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { Select } from "../components/ui/Select";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { useToast } from "../utils/toast";
import { formatDateTime } from "../utils/format";
import { formatWorkflowLabel, parseIdList } from "../utils/workflow";

const CRIME_LEVEL_OPTIONS: Array<{ value: CrimeLevel; label: string }> = [
  { value: "level_3", label: "Level 3" },
  { value: "level_2", label: "Level 2" },
  { value: "level_1", label: "Level 1" },
  { value: "critical", label: "Critical" }
];

interface ComplaintCreateForm {
  title: string;
  description: string;
  crime_level: CrimeLevel;
  additionalComplainants: string;
}

interface ComplaintCreateErrors {
  title?: string;
  description?: string;
  crime_level?: string;
  additionalComplainants?: string;
}

function getStatusTone(status: ComplaintStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "officer_approved") return "success";
  if (status === "cadet_rejected" || status === "officer_rejected") return "warning";
  if (status === "invalid") return "danger";
  return "neutral";
}

export const ComplaintsPage: React.FC = () => {
  const { showError, showSuccess } = useToast();

  const {
    data: complaints,
    isLoading,
    error,
    refetch
  } = useAsyncData<ComplaintListItem[]>(listComplaints, []);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState<ComplaintCreateForm>({
    title: "",
    description: "",
    crime_level: "level_3",
    additionalComplainants: ""
  });
  const [createErrors, setCreateErrors] = useState<ComplaintCreateErrors>({});

  const columns = useMemo<DataTableColumn<ComplaintListItem>[]>(
    () => [
      { key: "id", header: "ID" },
      { key: "title", header: "Title" },
      {
        key: "crime_level",
        header: "Crime level",
        render: (row) => formatWorkflowLabel(row.crime_level)
      },
      {
        key: "current_status",
        header: "Status",
        render: (row) => (
          <span className={`status-pill status-pill--${getStatusTone(row.current_status)}`}>
            {formatWorkflowLabel(row.current_status)}
          </span>
        )
      },
      {
        key: "invalid_attempts",
        header: "Invalid attempts"
      },
      {
        key: "updated_at",
        header: "Updated",
        render: (row) => formatDateTime(row.updated_at)
      },
      {
        key: "id",
        header: "Action",
        render: (row) => (
          <Link to={`/complaints/${row.id}`}>
            <Button variant="secondary" type="button">
              Open
            </Button>
          </Link>
        )
      }
    ],
    []
  );

  const handleCreateTextChange =
    (field: "title" | "description" | "additionalComplainants") =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setCreateForm((prev) => ({ ...prev, [field]: value }));
    };

  const parseAdditionalComplainants = (raw: string): number[] | null => {
    if (!raw.trim()) return [];
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return [];

    const parsed = parseIdList(raw);
    if (parsed.length !== parts.length) return null;
    return parsed;
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateErrors({});

    const nextErrors: ComplaintCreateErrors = {};
    if (!createForm.title.trim()) nextErrors.title = "Title is required.";
    if (!createForm.description.trim()) nextErrors.description = "Description is required.";
    if (!createForm.crime_level) nextErrors.crime_level = "Crime level is required.";

    const additionalIds = parseAdditionalComplainants(createForm.additionalComplainants);
    if (additionalIds === null) {
      nextErrors.additionalComplainants = "Use comma-separated positive user IDs. Example: 12, 44, 91";
    }

    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors);
      return;
    }

    const payload: ComplaintCreatePayload = {
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      crime_level: createForm.crime_level
    };
    if (additionalIds && additionalIds.length > 0) {
      payload.additional_complainant_ids = additionalIds;
    }

    setIsSubmitting(true);
    try {
      const created = await createComplaint(payload);
      showSuccess(`Complaint #${created.id} created successfully.`);
      setCreateForm({
        title: "",
        description: "",
        crime_level: "level_3",
        additionalComplainants: ""
      });
      setIsCreateOpen(false);
      await refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMap = (err.fields ?? {}) as Record<string, unknown>;
        const mappedErrors: ComplaintCreateErrors = {};
        const titleError = fieldMap.title;
        const descriptionError = fieldMap.description;
        const levelError = fieldMap.crime_level;
        const complainantsError = fieldMap.additional_complainant_ids;

        if (titleError) mappedErrors.title = Array.isArray(titleError) ? titleError.join(" ") : String(titleError);
        if (descriptionError) {
          mappedErrors.description = Array.isArray(descriptionError)
            ? descriptionError.join(" ")
            : String(descriptionError);
        }
        if (levelError) {
          mappedErrors.crime_level = Array.isArray(levelError) ? levelError.join(" ") : String(levelError);
        }
        if (complainantsError) {
          mappedErrors.additionalComplainants = Array.isArray(complainantsError)
            ? complainantsError.join(" ")
            : String(complainantsError);
        }
        if (Object.keys(mappedErrors).length > 0) setCreateErrors(mappedErrors);
        showError(err.message || "Failed to create complaint.");
      } else {
        showError("Failed to create complaint.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Complaints</h1>
          <p className="workflow-muted">
            Submit new complaints and track review status through cadet and officer checkpoints.
          </p>
        </div>
        <div className="workflow-actions">
          <BackToDashboardButton />
          <Button type="button" onClick={() => setIsCreateOpen((prev) => !prev)} variant="secondary">
            {isCreateOpen ? "Close Form" : "Create Complaint"}
          </Button>
        </div>
      </section>

      {isCreateOpen && (
        <Card title="Create complaint">
          <form className="workflow-form" onSubmit={handleCreateSubmit}>
            <TextInput
              label="Title"
              name="title"
              value={createForm.title}
              onChange={handleCreateTextChange("title")}
              error={createErrors.title}
            />
            <div className="workflow-field">
              <label className="ui-field__label" htmlFor="complaint-description">
                Description
              </label>
              <textarea
                id="complaint-description"
                className="ui-textarea"
                rows={4}
                value={createForm.description}
                onChange={handleCreateTextChange("description")}
                placeholder="Describe the incident details."
              />
              {createErrors.description && <div className="ui-field__error">{createErrors.description}</div>}
            </div>
            <Select
              label="Crime level"
              name="crime_level"
              value={createForm.crime_level}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, crime_level: event.target.value as CrimeLevel }))
              }
              options={CRIME_LEVEL_OPTIONS}
              error={createErrors.crime_level}
            />
            <TextInput
              label="Additional complainant IDs (optional)"
              name="additionalComplainants"
              value={createForm.additionalComplainants}
              onChange={handleCreateTextChange("additionalComplainants")}
              error={createErrors.additionalComplainants}
              placeholder="Example: 12, 44, 91"
            />
            <p className="workflow-muted workflow-muted--small">
              If there is no user search endpoint yet, this field is optional. Leave empty to submit only as yourself.
            </p>
            <div className="workflow-actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Submit Complaint"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Complaint queue">
        {error && (
          <Alert
            variant="error"
            title="Failed to load complaints"
            actions={
              <Button variant="secondary" type="button" onClick={refetch}>
                Retry
              </Button>
            }
          >
            The complaint list could not be loaded. Please try again.
          </Alert>
        )}

        {isLoading && <TableSkeleton rows={6} columns={7} />}

        {!isLoading && complaints && (
          <DataTable columns={columns} data={complaints} emptyMessage="No complaints available for your account." />
        )}
      </Card>
    </div>
  );
};
