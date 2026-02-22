import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export interface CaseReportCase {
  id: number;
  title: string;
  description: string;
  crime_level: string;
  status: string;
  created_at: string;
  assigned_to: number | null;
  formed_at?: string | null;
}

export interface InterrogationReport {
  id: number;
  detective_score: number | null;
  detective_submitted_by: number | null;
  detective_submitted_at: string | null;
  sergeant_score: number | null;
  sergeant_submitted_by: number | null;
  sergeant_submitted_at: string | null;
  captain_final_decision: boolean | null;
  captain_reasoning: string;
  captain_decided_by: number | null;
  captain_decided_at: string | null;
  chief_decision: boolean | null;
  chief_message: string;
  chief_reviewed_by: number | null;
  chief_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CaseSuspectStatus = "proposed" | "approved" | "rejected";

export interface CaseReportSuspect {
  id: number;
  case: number;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  notes: string;
  proposed_by: number | null;
  proposed_at: string;
  status: CaseSuspectStatus;
  sergeant_message: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  interrogation?: InterrogationReport | null;
}

export interface CaseReportPayload {
  case: CaseReportCase;
  suspects: CaseReportSuspect[];
  // other report keys exist (complaint/scene_report/evidence/police_involved)
  // but Step 7 only needs suspects + case metadata.
  [key: string]: unknown;
}

export function getCaseReport(caseId: number | string): Promise<CaseReportPayload> {
  return apiRequest<CaseReportPayload>(endpoints.caseReport(caseId), {
    method: "GET"
  });
}