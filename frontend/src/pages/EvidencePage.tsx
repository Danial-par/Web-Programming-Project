import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { CaseListItem, listCases } from "../api/cases";
import {
  EvidenceAttachmentKind,
  EvidenceRecord,
  EvidenceType,
  EvidenceWritePayload,
  createEvidence,
  listEvidence
} from "../api/evidence";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataTable, DataTableColumn } from "../components/ui/DataTable";
import { Select } from "../components/ui/Select";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { resolveMediaUrl } from "../utils/media";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel } from "../utils/workflow";

const EVIDENCE_TYPE_OPTIONS: Array<{ value: EvidenceType; label: string }> = [
  { value: "witness_statement", label: "Witness Statement" },
  { value: "forensic", label: "Forensic" },
  { value: "vehicle", label: "Vehicle" },
  { value: "identity_document", label: "Identity Document" },
  { value: "other", label: "Other" }
];

const ATTACHMENT_KIND_OPTIONS: Array<{ value: EvidenceAttachmentKind; label: string }> = [
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Document" }
];

interface EvidenceFormState {
  caseId: string;
  type: EvidenceType;
  title: string;
  description: string;
  witness_transcription: string;
  vehicle_model: string;
  color: string;
  plate_number: string;
  serial_number: string;
  owner_full_name: string;
  extra_info_text: string;
}

interface EvidenceFormErrors {
  caseId?: string;
  type?: string;
  title?: string;
  description?: string;
  witness_transcription?: string;
  vehicle_model?: string;
  color?: string;
  plate_number?: string;
  serial_number?: string;
  owner_full_name?: string;
  extra_info_text?: string;
  attachments?: string;
}

interface AttachmentRow {
  id: string;
  file: File | null;
  kind: EvidenceAttachmentKind;
}

function parseCaseId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function newAttachmentRow(defaultKind: EvidenceAttachmentKind = "image"): AttachmentRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file: null,
    kind: defaultKind
  };
}

function getEvidenceTone(type: EvidenceType): "success" | "warning" | "danger" | "neutral" {
  if (type === "forensic") return "danger";
  if (type === "witness_statement") return "warning";
  if (type === "vehicle") return "success";
  return "neutral";
}

export const EvidencePage: React.FC = () => {
  const { showError, showSuccess } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseFromQuery = parseCaseId(searchParams.get("case"));

  const [selectedCaseId, setSelectedCaseId] = useState<number | "">(caseFromQuery ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState<EvidenceFormErrors>({});
  const [createForm, setCreateForm] = useState<EvidenceFormState>({
    caseId: caseFromQuery ? String(caseFromQuery) : "",
    type: "other",
    title: "",
    description: "",
    witness_transcription: "",
    vehicle_model: "",
    color: "",
    plate_number: "",
    serial_number: "",
    owner_full_name: "",
    extra_info_text: ""
  });
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([newAttachmentRow("image")]);

  const {
    data: cases,
    isLoading: isCasesLoading,
    error: casesError,
    refetch: refetchCases
  } = useAsyncData<CaseListItem[]>(listCases, []);

  const {
    data: evidenceItems,
    isLoading: isEvidenceLoading,
    error: evidenceError,
    refetch: refetchEvidence
  } = useAsyncData<EvidenceRecord[]>(
    () => listEvidence(selectedCaseId === "" ? undefined : selectedCaseId),
    [selectedCaseId]
  );

  const caseFilterOptions = useMemo(() => {
    const base = [{ value: "", label: "All accessible cases" }];
    const caseOptions =
      cases?.map((caseItem) => ({
        value: String(caseItem.id),
        label: `#${caseItem.id} — ${caseItem.title}`
      })) ?? [];
    const selectedFallback =
      selectedCaseId !== "" && !caseOptions.some((option) => option.value === String(selectedCaseId))
        ? [{ value: String(selectedCaseId), label: `#${selectedCaseId} — Selected case` }]
        : [];
    return [...base, ...selectedFallback, ...caseOptions];
  }, [cases, selectedCaseId]);

  const createCaseOptions = useMemo(() => {
    const options = (cases ?? []).map((caseItem) => ({
      value: String(caseItem.id),
      label: `#${caseItem.id} — ${caseItem.title}`
    }));
    if (!createForm.caseId) {
      return [{ value: "", label: "Select case" }, ...options];
    }
    if (!options.some((option) => option.value === createForm.caseId)) {
      return [{ value: "", label: "Select case" }, { value: createForm.caseId, label: `#${createForm.caseId} — Selected case` }, ...options];
    }
    return [{ value: "", label: "Select case" }, ...options];
  }, [cases, createForm.caseId]);

  const evidenceColumns = useMemo<DataTableColumn<EvidenceRecord>[]>(
    () => [
      { key: "id", header: "ID" },
      {
        key: "case",
        header: "Case",
        render: (row) => `#${row.case}`
      },
      {
        key: "type",
        header: "Type",
        render: (row) => (
          <span className={`status-pill status-pill--${getEvidenceTone(row.type)}`}>{formatWorkflowLabel(row.type)}</span>
        )
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
                return mediaUrl ? (
                  <a
                    className="workflow-link"
                    key={attachment.id}
                    href={mediaUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {formatWorkflowLabel(attachment.kind)} #{attachment.id}
                  </a>
                ) : (
                  <span key={attachment.id} className="workflow-muted">
                    Attachment #{attachment.id}
                  </span>
                );
              })}
            </div>
          );
        }
      },
      {
        key: "id",
        header: "Action",
        render: (row) => {
          const query = selectedCaseId === "" ? "" : `?case=${selectedCaseId}`;
          return (
            <Link to={`/evidence/${row.id}${query}`}>
              <Button variant="secondary" type="button">
                Open
              </Button>
            </Link>
          );
        }
      }
    ],
    [selectedCaseId]
  );

  const availableKinds = useMemo<EvidenceAttachmentKind[]>(() => {
    if (createForm.type === "forensic") return ["image"];
    if (createForm.type === "witness_statement") return ["image", "video", "audio"];
    return ["image", "video", "audio", "document"];
  }, [createForm.type]);

  useEffect(() => {
    setAttachmentRows((prev) =>
      prev.map((row) =>
        availableKinds.includes(row.kind)
          ? row
          : {
              ...row,
              kind: availableKinds[0]
            }
      )
    );
  }, [availableKinds]);

  const activeAttachmentRows = attachmentRows.filter((row) => row.file);

  const handleCaseFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
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

  const handleFormChange =
    (field: keyof EvidenceFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      setCreateForm((prev) => ({ ...prev, [field]: value }));
    };

  const addAttachmentRow = () => {
    setAttachmentRows((prev) => [...prev, newAttachmentRow(availableKinds[0])]);
  };

  const removeAttachmentRow = (rowId: string) => {
    setAttachmentRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const updateAttachmentKind = (rowId: string, value: string) => {
    const nextKind = value as EvidenceAttachmentKind;
    if (!availableKinds.includes(nextKind)) return;
    setAttachmentRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              kind: nextKind
            }
          : row
      )
    );
  };

  const updateAttachmentFile = (rowId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
    setAttachmentRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              file,
              kind: availableKinds.includes(row.kind) ? row.kind : availableKinds[0]
            }
          : row
      )
    );
  };

  const resetCreateForm = () => {
    setCreateForm({
      caseId: selectedCaseId === "" ? "" : String(selectedCaseId),
      type: "other",
      title: "",
      description: "",
      witness_transcription: "",
      vehicle_model: "",
      color: "",
      plate_number: "",
      serial_number: "",
      owner_full_name: "",
      extra_info_text: ""
    });
    setAttachmentRows([newAttachmentRow("image")]);
    setCreateErrors({});
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateErrors({});

    const errors: EvidenceFormErrors = {};
    const parsedCaseId = Number(createForm.caseId);
    if (!Number.isInteger(parsedCaseId) || parsedCaseId <= 0) {
      errors.caseId = "Select a valid case.";
    }
    if (!createForm.title.trim()) {
      errors.title = "Title is required.";
    }

    if (createForm.type === "witness_statement" && !createForm.witness_transcription.trim()) {
      errors.witness_transcription = "Witness transcription is required for witness statements.";
    }

    if (createForm.type === "vehicle") {
      if (!createForm.vehicle_model.trim()) errors.vehicle_model = "Vehicle model is required.";
      if (!createForm.color.trim()) errors.color = "Vehicle color is required.";

      const hasPlate = !!createForm.plate_number.trim();
      const hasSerial = !!createForm.serial_number.trim();
      if (hasPlate && hasSerial) {
        errors.plate_number = "Provide either plate number or serial number, not both.";
        errors.serial_number = "Provide either plate number or serial number, not both.";
      } else if (!hasPlate && !hasSerial) {
        errors.plate_number = "Provide either plate number or serial number.";
      }
    }

    if (createForm.type === "identity_document" && !createForm.owner_full_name.trim()) {
      errors.owner_full_name = "Owner full name is required for identity document evidence.";
    }

    if (createForm.extra_info_text.trim()) {
      try {
        const parsed = JSON.parse(createForm.extra_info_text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          errors.extra_info_text = "Extra info must be a JSON object (key/value map).";
        }
      } catch {
        errors.extra_info_text = "Extra info must be valid JSON.";
      }
    }

    if (createForm.type === "forensic" && activeAttachmentRows.length === 0) {
      errors.attachments = "Forensic evidence requires at least one image attachment.";
    }

    if (createForm.type === "forensic" && activeAttachmentRows.some((row) => row.kind !== "image")) {
      errors.attachments = "Forensic evidence attachments must all be image.";
    }

    if (
      createForm.type === "witness_statement" &&
      activeAttachmentRows.some((row) => !["image", "video", "audio"].includes(row.kind))
    ) {
      errors.attachments = "Witness statement attachments can only be image, video, or audio.";
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      return;
    }

    const payload: EvidenceWritePayload = {
      case: parsedCaseId,
      type: createForm.type,
      title: createForm.title.trim(),
      description: createForm.description.trim(),
      files: activeAttachmentRows.map((row) => ({
        file: row.file as File,
        kind: row.kind
      }))
    };

    if (createForm.type === "witness_statement") {
      payload.witness_transcription = createForm.witness_transcription.trim();
    }
    if (createForm.type === "vehicle") {
      payload.vehicle_model = createForm.vehicle_model.trim();
      payload.color = createForm.color.trim();
      payload.plate_number = createForm.plate_number.trim() || null;
      payload.serial_number = createForm.serial_number.trim() || null;
    }
    if (createForm.type === "identity_document") {
      payload.owner_full_name = createForm.owner_full_name.trim();
      if (createForm.extra_info_text.trim()) {
        payload.extra_info = JSON.parse(createForm.extra_info_text) as Record<string, unknown>;
      }
    }

    setIsSubmitting(true);
    try {
      const created = await createEvidence(payload);
      showSuccess(`Evidence #${created.id} created.`);
      setIsCreateOpen(false);
      if (selectedCaseId !== parsedCaseId) {
        setSelectedCaseId(parsedCaseId);
      }
      resetCreateForm();
      await refetchEvidence();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = (err.fields ?? {}) as Record<string, unknown>;
        const mappedErrors: EvidenceFormErrors = {};
        const copyFieldError = (apiField: string, localField: keyof EvidenceFormErrors) => {
          const value = fields[apiField];
          if (!value) return;
          mappedErrors[localField] = Array.isArray(value) ? value.join(" ") : String(value);
        };

        copyFieldError("case", "caseId");
        copyFieldError("type", "type");
        copyFieldError("title", "title");
        copyFieldError("description", "description");
        copyFieldError("witness_transcription", "witness_transcription");
        copyFieldError("vehicle_model", "vehicle_model");
        copyFieldError("color", "color");
        copyFieldError("plate_number", "plate_number");
        copyFieldError("serial_number", "serial_number");
        copyFieldError("owner_full_name", "owner_full_name");
        copyFieldError("extra_info", "extra_info_text");
        copyFieldError("files", "attachments");
        copyFieldError("kinds", "attachments");
        copyFieldError("non_field_errors", "attachments");

        if (Object.keys(mappedErrors).length > 0) {
          setCreateErrors(mappedErrors);
        }
        showError(err.message || "Failed to create evidence.");
      } else {
        showError("Failed to create evidence.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const attachmentKindOptions = ATTACHMENT_KIND_OPTIONS.filter((opt) => availableKinds.includes(opt.value));

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Evidence</h1>
          <p className="workflow-muted">
            Register and review evidence by case, including typed metadata and attachment bundles.
          </p>
        </div>
        <div className="workflow-actions">
          <BackToDashboardButton />
          <Button type="button" variant="secondary" onClick={() => setIsCreateOpen((prev) => !prev)}>
            {isCreateOpen ? "Close Form" : "Register Evidence"}
          </Button>
        </div>
      </section>

      <Card title="Filter">
        <div className="workflow-panel-grid">
          <Select
            label="Case filter"
            value={selectedCaseId === "" ? "" : String(selectedCaseId)}
            onChange={handleCaseFilterChange}
            options={caseFilterOptions}
          />
        </div>
        {casesError && (
          <div style={{ marginTop: "0.75rem" }}>
            <Alert
              variant="error"
              title="Failed to load cases"
              actions={
                <Button type="button" variant="secondary" onClick={refetchCases}>
                  Retry
                </Button>
              }
            >
              Case dropdown options are unavailable. Please retry.
            </Alert>
          </div>
        )}
      </Card>

      {isCreateOpen && (
        <Card title="Create evidence">
          <form className="workflow-form" onSubmit={handleCreateSubmit}>
            <Select
              label="Case"
              value={createForm.caseId}
              onChange={handleFormChange("caseId")}
              options={createCaseOptions}
              error={createErrors.caseId}
            />

            <Select
              label="Evidence type"
              value={createForm.type}
              onChange={handleFormChange("type")}
              options={EVIDENCE_TYPE_OPTIONS}
              error={createErrors.type}
            />

            <TextInput label="Title" value={createForm.title} onChange={handleFormChange("title")} error={createErrors.title} />

            <div className="workflow-field">
              <label className="ui-field__label" htmlFor="evidence-description">
                Description
              </label>
              <textarea
                id="evidence-description"
                className="ui-textarea"
                rows={3}
                value={createForm.description}
                onChange={handleFormChange("description")}
                placeholder="Describe this evidence item."
              />
              {createErrors.description && <div className="ui-field__error">{createErrors.description}</div>}
            </div>

            {createForm.type === "witness_statement" && (
              <div className="workflow-field">
                <label className="ui-field__label" htmlFor="witness-transcription">
                  Witness transcription
                </label>
                <textarea
                  id="witness-transcription"
                  className="ui-textarea"
                  rows={4}
                  value={createForm.witness_transcription}
                  onChange={handleFormChange("witness_transcription")}
                  placeholder="Write the witness statement transcription..."
                />
                {createErrors.witness_transcription && (
                  <div className="ui-field__error">{createErrors.witness_transcription}</div>
                )}
              </div>
            )}

            {createForm.type === "vehicle" && (
              <div className="workflow-panel-grid">
                <TextInput
                  label="Vehicle model"
                  value={createForm.vehicle_model}
                  onChange={handleFormChange("vehicle_model")}
                  error={createErrors.vehicle_model}
                />
                <TextInput label="Color" value={createForm.color} onChange={handleFormChange("color")} error={createErrors.color} />
                <TextInput
                  label="Plate number"
                  value={createForm.plate_number}
                  onChange={handleFormChange("plate_number")}
                  error={createErrors.plate_number}
                />
                <TextInput
                  label="Serial number"
                  value={createForm.serial_number}
                  onChange={handleFormChange("serial_number")}
                  error={createErrors.serial_number}
                />
              </div>
            )}

            {createForm.type === "identity_document" && (
              <div className="workflow-stack">
                <TextInput
                  label="Owner full name"
                  value={createForm.owner_full_name}
                  onChange={handleFormChange("owner_full_name")}
                  error={createErrors.owner_full_name}
                />
                <div className="workflow-field">
                  <label className="ui-field__label" htmlFor="identity-extra-info">
                    Extra info (JSON key/value object)
                  </label>
                  <textarea
                    id="identity-extra-info"
                    className="ui-textarea"
                    rows={5}
                    value={createForm.extra_info_text}
                    onChange={handleFormChange("extra_info_text")}
                    placeholder='{"document_number":"P12345","country":"US"}'
                  />
                  {createErrors.extra_info_text && <div className="ui-field__error">{createErrors.extra_info_text}</div>}
                </div>
              </div>
            )}

            <div className="workflow-fieldset">
              <div className="workflow-fieldset__header">
                <div className="ui-field__label">Attachments</div>
                <Button type="button" variant="secondary" onClick={addAttachmentRow}>
                  Add File
                </Button>
              </div>

              <div className="attachment-list">
                {attachmentRows.map((row) => (
                  <div className="attachment-row" key={row.id}>
                    <div className="workflow-field">
                      <label className="ui-field__label" htmlFor={`attachment-file-${row.id}`}>
                        File
                      </label>
                      <input
                        id={`attachment-file-${row.id}`}
                        className="ui-file-input"
                        type="file"
                        onChange={(event) => updateAttachmentFile(row.id, event)}
                      />
                    </div>
                    <Select
                      label="Kind"
                      value={row.kind}
                      onChange={(event) => updateAttachmentKind(row.id, event.target.value)}
                      options={attachmentKindOptions}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="attachment-row__remove"
                      onClick={() => removeAttachmentRow(row.id)}
                      disabled={attachmentRows.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              {createErrors.attachments && <div className="ui-field__error">{createErrors.attachments}</div>}
              <p className="workflow-muted workflow-muted--small">
                Selected files: {activeAttachmentRows.length}. Evidence type rules will be enforced before submit.
              </p>
            </div>

            {isSubmitting && (
              <Alert variant="info" title="Uploading evidence">
                Uploading {activeAttachmentRows.length} attachment(s). Please wait...
              </Alert>
            )}

            <div className="workflow-actions">
              <Button type="submit" disabled={isSubmitting || isCasesLoading}>
                {isSubmitting ? "Submitting..." : "Create Evidence"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetCreateForm();
                  setIsCreateOpen(false);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Evidence list">
        {evidenceError && (
          <Alert
            variant="error"
            title="Failed to load evidence"
            actions={
              <Button type="button" variant="secondary" onClick={refetchEvidence}>
                Retry
              </Button>
            }
          >
            Could not load evidence records for the selected filter.
          </Alert>
        )}

        {isEvidenceLoading && <TableSkeleton rows={6} columns={8} />}

        {!isEvidenceLoading && evidenceItems && (
          <DataTable
            columns={evidenceColumns}
            data={evidenceItems}
            emptyMessage={
              selectedCaseId === ""
                ? "No evidence records found."
                : `No evidence found for case #${selectedCaseId}.`
            }
          />
        )}
      </Card>
    </div>
  );
};
