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
