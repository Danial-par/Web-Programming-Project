import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  EvidenceAttachmentKind,
  EvidenceRecord,
  EvidenceWritePayload,
  ForensicResultsPayload,
  deleteEvidence,
  getEvidence,
  updateEvidence,
  updateForensicResults
} from "../api/evidence";
import { useAuthContext } from "../auth/AuthContext";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { Select } from "../components/ui/Select";
import { TextInput } from "../components/ui/TextInput";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime } from "../utils/format";
import { resolveMediaUrl } from "../utils/media";
import { useToast } from "../utils/toast";
import { formatWorkflowLabel, hasRoleKeyword } from "../utils/workflow";

interface EvidenceEditFormState {
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

interface EvidenceEditErrors {
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

function newAttachmentRow(defaultKind: EvidenceAttachmentKind = "image"): AttachmentRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file: null,
    kind: defaultKind
  };
}

export const EvidenceDetailPage: React.FC = () => {
  const params = useParams();
  const evidenceId = Number(params.evidenceId);
  const isValidId = Number.isInteger(evidenceId) && evidenceId > 0;
  const [searchParams] = useSearchParams();
  const selectedCaseId = searchParams.get("case");
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { showError, showSuccess } = useToast();

  const {
    data: fetchedEvidence,
    isLoading,
    error,
    refetch
  } = useAsyncData<EvidenceRecord>(
    async () => {
      if (!isValidId) {
        throw new Error("Invalid evidence ID.");
      }
      return getEvidence(evidenceId);
    },
    [evidenceId, isValidId]
  );

  const [evidence, setEvidence] = useState<EvidenceRecord | null>(null);
  const [editForm, setEditForm] = useState<EvidenceEditFormState>({
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
  const [attachments, setAttachments] = useState<AttachmentRow[]>([newAttachmentRow("image")]);
  const [editErrors, setEditErrors] = useState<EvidenceEditErrors>({});
  const [forensicResult, setForensicResult] = useState({
    coroner_result: "",
    identity_db_result: ""
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isForensicSubmitting, setIsForensicSubmitting] = useState(false);
  const [canUpdate, setCanUpdate] = useState(true);
  const [canDelete, setCanDelete] = useState(true);
  const [canForensicUpdate, setCanForensicUpdate] = useState(true);

  useEffect(() => {
    if (!fetchedEvidence) return;
    setEvidence(fetchedEvidence);
    setEditForm({
      title: fetchedEvidence.title ?? "",
      description: fetchedEvidence.description ?? "",
      witness_transcription: fetchedEvidence.witness_transcription ?? "",
      vehicle_model: fetchedEvidence.vehicle_model ?? "",
      color: fetchedEvidence.color ?? "",
      plate_number: fetchedEvidence.plate_number ?? "",
      serial_number: fetchedEvidence.serial_number ?? "",
      owner_full_name: fetchedEvidence.owner_full_name ?? "",
      extra_info_text:
        fetchedEvidence.extra_info && Object.keys(fetchedEvidence.extra_info).length > 0
          ? JSON.stringify(fetchedEvidence.extra_info, null, 2)
          : ""
    });
    setForensicResult({
      coroner_result: fetchedEvidence.coroner_result ?? "",
      identity_db_result: fetchedEvidence.identity_db_result ?? ""
    });
  }, [fetchedEvidence]);

  const isCoronerRole = hasRoleKeyword(user?.roles, ["coroner"]);

  const availableKinds = useMemo<EvidenceAttachmentKind[]>(() => {
    if (!evidence) return ["image", "video", "audio", "document"];
    if (evidence.type === "forensic") return ["image"];
    if (evidence.type === "witness_statement") return ["image", "video", "audio"];
    return ["image", "video", "audio", "document"];
  }, [evidence]);

  const attachmentKindOptions = useMemo(
    () =>
      [
        { value: "image", label: "Image" },
        { value: "video", label: "Video" },
        { value: "audio", label: "Audio" },
        { value: "document", label: "Document" }
      ].filter((option) => availableKinds.includes(option.value as EvidenceAttachmentKind)),
    [availableKinds]
  );

  const activeAttachments = attachments.filter((row) => row.file);
  const backPath = selectedCaseId ? `/evidence?case=${selectedCaseId}` : "/evidence";

  const handleEditField =
    (field: keyof EvidenceEditFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setEditForm((prev) => ({ ...prev, [field]: value }));
    };

  const addAttachment = () => {
    setAttachments((prev) => [...prev, newAttachmentRow(availableKinds[0])]);
  };

  const removeAttachment = (rowId: string) => {
    setAttachments((prev) => prev.filter((row) => row.id !== rowId));
  };

  const updateAttachmentKind = (rowId: string, value: string) => {
    const nextKind = value as EvidenceAttachmentKind;
    if (!availableKinds.includes(nextKind)) return;
    setAttachments((prev) => prev.map((row) => (row.id === rowId ? { ...row, kind: nextKind } : row)));
  };

  const updateAttachmentFile = (rowId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
    setAttachments((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              file
            }
          : row
      )
    );
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!evidence) return;
    setEditErrors({});

    const errors: EvidenceEditErrors = {};
    if (!editForm.title.trim()) {
      errors.title = "Title is required.";
    }

    if (evidence.type === "witness_statement" && !editForm.witness_transcription.trim()) {
      errors.witness_transcription = "Witness transcription is required.";
    }

    if (evidence.type === "vehicle") {
      if (!editForm.vehicle_model.trim()) errors.vehicle_model = "Vehicle model is required.";
      if (!editForm.color.trim()) errors.color = "Vehicle color is required.";

      const hasPlate = !!editForm.plate_number.trim();
      const hasSerial = !!editForm.serial_number.trim();
      if (hasPlate && hasSerial) {
        errors.plate_number = "Provide either plate number or serial number, not both.";
        errors.serial_number = "Provide either plate number or serial number, not both.";
      } else if (!hasPlate && !hasSerial) {
        errors.plate_number = "Provide either plate number or serial number.";
      }
    }

    if (evidence.type === "identity_document") {
      if (!editForm.owner_full_name.trim()) {
        errors.owner_full_name = "Owner full name is required.";
      }
      if (editForm.extra_info_text.trim()) {
        try {
          const parsed = JSON.parse(editForm.extra_info_text);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            errors.extra_info_text = "Extra info must be a JSON object.";
          }
        } catch {
          errors.extra_info_text = "Extra info must be valid JSON.";
        }
      }
    }

    if (evidence.type === "forensic" && activeAttachments.some((row) => row.kind !== "image")) {
      errors.attachments = "Forensic evidence attachments must be image.";
    }
    if (evidence.type === "witness_statement" && activeAttachments.some((row) => row.kind === "document")) {
      errors.attachments = "Witness statements do not support document attachments.";
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    const payload: EvidenceWritePayload = {
      title: editForm.title.trim(),
      description: editForm.description.trim()
    };
    if (activeAttachments.length > 0) {
      payload.files = activeAttachments.map((row) => ({ file: row.file as File, kind: row.kind }));
    }

    if (evidence.type === "witness_statement") {
      payload.witness_transcription = editForm.witness_transcription.trim();
    }

    if (evidence.type === "vehicle") {
      payload.vehicle_model = editForm.vehicle_model.trim();
      payload.color = editForm.color.trim();
      payload.plate_number = editForm.plate_number.trim() || null;
      payload.serial_number = editForm.serial_number.trim() || null;
    }

    if (evidence.type === "identity_document") {
      payload.owner_full_name = editForm.owner_full_name.trim();
      if (editForm.extra_info_text.trim()) {
        payload.extra_info = JSON.parse(editForm.extra_info_text) as Record<string, unknown>;
      } else {
        payload.extra_info = {};
      }
    }

    setIsUpdating(true);
    try {
      const updated = await updateEvidence(evidence.id, payload);
      setEvidence(updated);
      setAttachments([newAttachmentRow(availableKinds[0])]);
      showSuccess("Evidence updated.");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setCanUpdate(false);
        }
        showError(err.message || "Failed to update evidence.");
      } else {
        showError("Failed to update evidence.");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!evidence) return;
    const confirmed = window.confirm(`Delete evidence #${evidence.id}? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteEvidence(evidence.id);
      showSuccess("Evidence deleted.");
      navigate(backPath);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setCanDelete(false);
        }
        showError(err.message || "Failed to delete evidence.");
      } else {
        showError("Failed to delete evidence.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForensicSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!evidence) return;

    const coroner = forensicResult.coroner_result.trim();
    const identity = forensicResult.identity_db_result.trim();
    if (!coroner && !identity) {
      showError("Provide at least one forensic result field.");
      return;
    }

    const payload: ForensicResultsPayload = {};
    if (coroner) payload.coroner_result = coroner;
    if (identity) payload.identity_db_result = identity;

    setIsForensicSubmitting(true);
    try {
      const updated = await updateForensicResults(evidence.id, payload);
      setEvidence(updated);
      setForensicResult({
        coroner_result: updated.coroner_result ?? "",
        identity_db_result: updated.identity_db_result ?? ""
      });
      showSuccess("Forensic results updated.");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setCanForensicUpdate(false);
        }
        showError(err.message || "Failed to update forensic results.");
      } else {
        showError("Failed to update forensic results.");
      }
    } finally {
      setIsForensicSubmitting(false);
    }
  };

  if (!isValidId) {
    return (
      <Alert variant="error" title="Invalid evidence URL">
        The evidence ID is not valid. Return to the evidence list and open a valid record.
      </Alert>
    );
  }

  if (isLoading && !evidence) {
    return <PageSkeleton />;
  }

  if (!evidence) {
    return (
      <Alert
        variant="error"
        title="Failed to load evidence"
        actions={
          <Button type="button" variant="secondary" onClick={refetch}>
            Retry
          </Button>
        }
      >
        {error?.message ?? "Evidence details are unavailable right now."}
      </Alert>
    );
  }

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Evidence #{evidence.id}</h1>
          <p className="workflow-muted">Review metadata, update fields, and manage attachments.</p>
        </div>
        <div className="workflow-actions">
          <Link to={backPath}>
            <Button type="button" variant="secondary">
              Back to Evidence
            </Button>
          </Link>
          <Link to={`/cases/${evidence.case}`}>
            <Button type="button" variant="secondary">
              Open Case #{evidence.case}
            </Button>
          </Link>
        </div>
      </section>

      <Card title="Overview">
        <div className="workflow-grid">
          <div>
            <div className="workflow-kv__label">Type</div>
            <div className="workflow-kv__value">
              <span className="status-pill status-pill--neutral">{formatWorkflowLabel(evidence.type)}</span>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Case</div>
            <div className="workflow-kv__value">
              <Link className="workflow-link" to={`/cases/${evidence.case}`}>
                Case #{evidence.case}
              </Link>
            </div>
          </div>
          <div>
            <div className="workflow-kv__label">Created at</div>
            <div className="workflow-kv__value">{formatDateTime(evidence.created_at)}</div>
          </div>
          <div>
            <div className="workflow-kv__label">Created by user ID</div>
            <div className="workflow-kv__value">{evidence.created_by ?? "—"}</div>
          </div>
        </div>
      </Card>

      <Card title="Attachments">
        {evidence.attachments.length === 0 ? (
          <p className="workflow-muted" style={{ margin: 0 }}>
            No attachments uploaded for this evidence.
          </p>
        ) : (
          <div className="evidence-attachment-list evidence-attachment-list--stacked">
            {evidence.attachments.map((attachment) => {
              const mediaUrl = resolveMediaUrl(attachment.file);
              return (
                <div key={attachment.id} className="evidence-attachment-item">
                  <div className="workflow-kv__value">{formatWorkflowLabel(attachment.kind)}</div>
                  <div className="workflow-muted workflow-muted--small">{formatDateTime(attachment.uploaded_at)}</div>
                  {mediaUrl ? (
                    <a className="workflow-link" href={mediaUrl} target="_blank" rel="noreferrer noopener">
                      Open attachment #{attachment.id}
                    </a>
                  ) : (
                    <span className="workflow-muted">Attachment URL unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {(canUpdate || canDelete) && (
        <Card title="Update / Delete">
          {canUpdate && (
            <form className="workflow-form" onSubmit={handleUpdate}>
              <TextInput
                label="Title"
                value={editForm.title}
                onChange={handleEditField("title")}
                error={editErrors.title}
              />
              <div className="workflow-field">
                <label className="ui-field__label" htmlFor="evidence-edit-description">
                  Description
                </label>
                <textarea
                  id="evidence-edit-description"
                  className="ui-textarea"
                  rows={3}
                  value={editForm.description}
                  onChange={handleEditField("description")}
                />
                {editErrors.description && <div className="ui-field__error">{editErrors.description}</div>}
              </div>

              {evidence.type === "witness_statement" && (
                <div className="workflow-field">
                  <label className="ui-field__label" htmlFor="evidence-edit-witness">
                    Witness transcription
                  </label>
                  <textarea
                    id="evidence-edit-witness"
                    className="ui-textarea"
                    rows={4}
                    value={editForm.witness_transcription}
                    onChange={handleEditField("witness_transcription")}
                  />
                  {editErrors.witness_transcription && (
                    <div className="ui-field__error">{editErrors.witness_transcription}</div>
                  )}
                </div>
              )}

              {evidence.type === "vehicle" && (
                <div className="workflow-panel-grid">
                  <TextInput
                    label="Vehicle model"
                    value={editForm.vehicle_model}
                    onChange={handleEditField("vehicle_model")}
                    error={editErrors.vehicle_model}
                  />
                  <TextInput label="Color" value={editForm.color} onChange={handleEditField("color")} error={editErrors.color} />
                  <TextInput
                    label="Plate number"
                    value={editForm.plate_number}
                    onChange={handleEditField("plate_number")}
                    error={editErrors.plate_number}
                  />
                  <TextInput
                    label="Serial number"
                    value={editForm.serial_number}
                    onChange={handleEditField("serial_number")}
                    error={editErrors.serial_number}
                  />
                </div>
              )}

              {evidence.type === "identity_document" && (
                <div className="workflow-stack">
                  <TextInput
                    label="Owner full name"
                    value={editForm.owner_full_name}
                    onChange={handleEditField("owner_full_name")}
                    error={editErrors.owner_full_name}
                  />
                  <div className="workflow-field">
                    <label className="ui-field__label" htmlFor="evidence-edit-extra-info">
                      Extra info (JSON object)
                    </label>
                    <textarea
                      id="evidence-edit-extra-info"
                      className="ui-textarea"
                      rows={5}
                      value={editForm.extra_info_text}
                      onChange={handleEditField("extra_info_text")}
                    />
                    {editErrors.extra_info_text && <div className="ui-field__error">{editErrors.extra_info_text}</div>}
                  </div>
                </div>
              )}

              <div className="workflow-fieldset">
                <div className="workflow-fieldset__header">
                  <div className="ui-field__label">Add new attachments (optional)</div>
                  <Button type="button" variant="secondary" onClick={addAttachment}>
                    Add File
                  </Button>
                </div>

                <div className="attachment-list">
                  {attachments.map((row) => (
                    <div className="attachment-row" key={row.id}>
                      <div className="workflow-field">
                        <label className="ui-field__label" htmlFor={`edit-attachment-file-${row.id}`}>
                          File
                        </label>
                        <input
                          id={`edit-attachment-file-${row.id}`}
                          type="file"
                          className="ui-file-input"
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
                        onClick={() => removeAttachment(row.id)}
                        disabled={attachments.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                {editErrors.attachments && <div className="ui-field__error">{editErrors.attachments}</div>}
              </div>

              <div className="workflow-actions">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? "Updating..." : "Update Evidence"}
                </Button>
              </div>
            </form>
          )}

          {canDelete && (
            <div style={{ marginTop: canUpdate ? "1rem" : 0 }}>
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete Evidence"}
              </Button>
            </div>
          )}
        </Card>
      )}

      {!canUpdate && !canDelete && (
        <Alert variant="info" title="No write access">
          Update/Delete actions were hidden after a 403 response from the API for this account.
        </Alert>
      )}

      {evidence.type === "forensic" && (
        <>
          {isCoronerRole && canForensicUpdate ? (
            <Card title="Forensic result update (Coroner)">
              <form className="workflow-form" onSubmit={handleForensicSubmit}>
                <div className="workflow-field">
                  <label className="ui-field__label" htmlFor="forensic-coroner-result">
                    Coroner result
                  </label>
                  <textarea
                    id="forensic-coroner-result"
                    className="ui-textarea"
                    rows={4}
                    value={forensicResult.coroner_result}
                    onChange={(event) =>
                      setForensicResult((prev) => ({ ...prev, coroner_result: event.target.value }))
                    }
                  />
                </div>
                <div className="workflow-field">
                  <label className="ui-field__label" htmlFor="forensic-identity-result">
                    Identity DB result
                  </label>
                  <textarea
                    id="forensic-identity-result"
                    className="ui-textarea"
                    rows={4}
                    value={forensicResult.identity_db_result}
                    onChange={(event) =>
                      setForensicResult((prev) => ({ ...prev, identity_db_result: event.target.value }))
                    }
                  />
                </div>
                <div className="workflow-actions">
                  <Button type="submit" disabled={isForensicSubmitting}>
                    {isForensicSubmitting ? "Submitting..." : "Submit Forensic Results"}
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Alert variant="info" title="Forensic update permissions">
              {isCoronerRole
                ? "Forensic update controls were hidden after a 403 response from the API."
                : "Only coroner users can submit forensic result updates."}
            </Alert>
          )}
        </>
      )}
    </div>
  );
};
