import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export type EvidenceType = "witness_statement" | "forensic" | "vehicle" | "identity_document" | "other";
export type EvidenceAttachmentKind = "image" | "video" | "audio" | "document";

export interface EvidenceAttachment {
  id: number;
  kind: EvidenceAttachmentKind;
  file: string;
  uploaded_at: string;
  uploaded_by: number | null;
}

export interface EvidenceRecord {
  id: number;
  case: number;
  type: EvidenceType;
  title: string;
  description: string;
  created_at: string;
  created_by: number | null;
  witness_transcription: string;
  coroner_result: string | null;
  identity_db_result: string | null;
  vehicle_model: string;
  color: string;
  plate_number: string | null;
  serial_number: string | null;
  owner_full_name: string;
  extra_info: Record<string, unknown>;
  attachments: EvidenceAttachment[];
}

export interface EvidenceFileInput {
  file: File;
  kind: EvidenceAttachmentKind;
}

export interface EvidenceWritePayload {
  case?: number;
  type?: EvidenceType;
  title?: string;
  description?: string;
  witness_transcription?: string;
  vehicle_model?: string;
  color?: string;
  plate_number?: string | null;
  serial_number?: string | null;
  owner_full_name?: string;
  extra_info?: Record<string, unknown>;
  files?: EvidenceFileInput[];
}

export interface ForensicResultsPayload {
  coroner_result?: string | null;
  identity_db_result?: string | null;
}

function withQuery(path: string, query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function appendValue(formData: FormData, key: string, value: unknown) {
  if (value === undefined) return;
  if (value === null) {
    formData.append(key, "");
    return;
  }
  if (typeof value === "string") {
    formData.append(key, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    formData.append(key, String(value));
    return;
  }
  formData.append(key, JSON.stringify(value));
}

function buildEvidenceFormData(payload: EvidenceWritePayload): FormData {
  const formData = new FormData();
  appendValue(formData, "case", payload.case);
  appendValue(formData, "type", payload.type);
  appendValue(formData, "title", payload.title);
  appendValue(formData, "description", payload.description);
  appendValue(formData, "witness_transcription", payload.witness_transcription);
  appendValue(formData, "vehicle_model", payload.vehicle_model);
  appendValue(formData, "color", payload.color);
  appendValue(formData, "plate_number", payload.plate_number);
  appendValue(formData, "serial_number", payload.serial_number);
  appendValue(formData, "owner_full_name", payload.owner_full_name);
  appendValue(formData, "extra_info", payload.extra_info);

  const files = payload.files ?? [];
  files.forEach(({ file, kind }) => {
    formData.append("files", file);
    formData.append("kinds", kind);
  });

  return formData;
}

export function listEvidence(caseId?: number): Promise<EvidenceRecord[]> {
  const path = withQuery(endpoints.evidence, { case: caseId });
  return apiRequest<EvidenceRecord[]>(path, { method: "GET" });
}

export function getEvidence(evidenceId: number | string): Promise<EvidenceRecord> {
  return apiRequest<EvidenceRecord>(endpoints.evidenceDetail(evidenceId), { method: "GET" });
}

export function createEvidence(payload: EvidenceWritePayload): Promise<EvidenceRecord> {
  return apiRequest<EvidenceRecord>(endpoints.evidence, {
    method: "POST",
    body: buildEvidenceFormData(payload)
  });
}

export function updateEvidence(evidenceId: number | string, payload: EvidenceWritePayload): Promise<EvidenceRecord> {
  const hasFiles = (payload.files ?? []).length > 0;
  if (hasFiles) {
    return apiRequest<EvidenceRecord>(endpoints.evidenceDetail(evidenceId), {
      method: "PATCH",
      body: buildEvidenceFormData(payload)
    });
  }

  return apiRequest<EvidenceRecord>(endpoints.evidenceDetail(evidenceId), {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteEvidence(evidenceId: number | string): Promise<void> {
  await apiRequest<null>(endpoints.evidenceDetail(evidenceId), {
    method: "DELETE"
  });
}

export function updateForensicResults(
  evidenceId: number | string,
  payload: ForensicResultsPayload
): Promise<EvidenceRecord> {
  return apiRequest<EvidenceRecord>(endpoints.evidenceForensicResults(evidenceId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
