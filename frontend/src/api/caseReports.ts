import { apiRequest } from "./client";
import { endpoints } from "./endpoints";
import { EvidenceRecord } from "./evidence";

export interface BasicUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  roles: string[];
}

export interface CaseReportCase {
  id: number;
  title: string;
  description: string;
  crime_level: string;
  status: string;
  created_at: string;
  formed_at: string | null;
  created_by: number | null;
  assigned_to: number | null;
  [key: string]: unknown;
}

export interface ComplaintReportComplainant {
  user_id: number;
  status: string;
}

export interface ComplaintReport {
  id: number;
  title: string;
  description: string;
  crime_level: string;
  current_status: string;
  invalid_attempts: number;
  cadet_message: string;
  officer_message: string;
  created_by: number;
  submitted_at: string;
  updated_at: string;
  cadet_reviewed_by: number | null;
  cadet_reviewed_at: string | null;
  officer_reviewed_by: number | null;
  officer_reviewed_at: string | null;
  case_id: number | null;
  complainants: ComplaintReportComplainant[];
}

export interface SceneWitnessReport {
  phone: string;
  national_id: string;
}

export interface SceneReportCaseBrief {
  id: number;
  title: string;
  description: string;
  crime_level: string;
  status: string;
  created_at: string;
  formed_at: string | null;
  created_by: number | null;
  assigned_to: number | null;
}

export interface SceneReport {
  id: number;
  case: SceneReportCaseBrief;
  scene_datetime: string;
  status: string;
  created_by: number | null;
  created_at: string;
  approved_by: number | null;
  approved_at: string | null;
  witnesses: SceneWitnessReport[];
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

export type TrialVerdict = "guilty" | "innocent";

export interface TrialReport {
  id: number;
  verdict: TrialVerdict | null;
  punishment_title: string;
  punishment_description: string;
  created_at: string;
  created_by: number | null;
  verdict_at: string | null;
  verdict_by: number | null;
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
  trials: TrialReport[];
}

export interface PoliceInvolved {
  created_by: BasicUser | null;
  assigned_to: BasicUser | null;
  complaint_review: {
    cadet_reviewed_by: BasicUser | null;
    officer_reviewed_by: BasicUser | null;
    cadet_message: string;
    officer_message: string;
    current_status: string;
  } | null;
  scene_report: {
    created_by: BasicUser | null;
    approved_by: BasicUser | null;
    status: string;
  } | null;
}

export interface CaseReportPayload {
  case: CaseReportCase;
  complaint: ComplaintReport | null;
  scene_report: SceneReport | null;
  evidence: EvidenceRecord[];
  suspects: CaseReportSuspect[];
  police_involved: PoliceInvolved;
}

export interface TrialVerdictPayload {
  verdict: TrialVerdict;
  punishment_title?: string;
  punishment_description?: string;
}

export function getCaseReport(caseId: number | string): Promise<CaseReportPayload> {
  return apiRequest<CaseReportPayload>(endpoints.caseReport(caseId), {
    method: "GET"
  });
}

export function submitTrialVerdict(
  caseId: number | string,
  suspectId: number | string,
  payload: TrialVerdictPayload
): Promise<TrialReport> {
  return apiRequest<TrialReport>(endpoints.caseSuspectTrial(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
