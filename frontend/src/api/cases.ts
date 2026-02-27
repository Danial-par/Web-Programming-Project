import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export type CaseStatus = "draft" | "active" | "closed";

export interface CaseListItem {
  id: number;
  title: string;
  crime_level: string;
  status: CaseStatus;
  created_at: string;
}

export interface CaseWitness {
  user_id: number;
  username: string;
  national_id: string;
  phone: string;
  email: string;
  role: "witness";
}

export interface CaseDetail {
  id: number;
  title: string;
  description: string;
  crime_level: string;
  status: CaseStatus;
  created_at: string;
  formed_at: string | null;
  created_by: number | null;
  assigned_to: number | null;
  [key: string]: unknown;
}

export function listCases(): Promise<CaseListItem[]> {
  return apiRequest<CaseListItem[]>(endpoints.cases, { method: "GET" });
}

export function getCase(caseId: number | string): Promise<CaseDetail> {
  return apiRequest<CaseDetail>(endpoints.caseDetail(caseId), { method: "GET" });
}

export function assignCaseDetective(caseId: number | string, detectiveId: number): Promise<CaseDetail> {
  return apiRequest<CaseDetail>(endpoints.caseAssignDetective(caseId), {
    method: "POST",
    body: JSON.stringify({ detective_id: detectiveId })
  });
}

export function listCaseWitnesses(caseId: number | string): Promise<CaseWitness[]> {
  return apiRequest<CaseWitness[]>(endpoints.caseWitnesses(caseId), { method: "GET" });
}

export function addCaseWitness(
  caseId: number | string,
  payload: { user_id?: number; national_id?: string }
): Promise<CaseWitness> {
  return apiRequest<CaseWitness>(endpoints.caseWitnesses(caseId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function removeCaseWitness(caseId: number | string, userId: number | string): Promise<void> {
  return apiRequest<void>(endpoints.caseRemoveWitness(caseId, userId), { method: "DELETE" });
}