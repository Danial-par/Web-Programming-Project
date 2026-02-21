import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export type CrimeLevel = "critical" | "level_1" | "level_2" | "level_3";
export type ComplaintStatus =
  | "draft"
  | "submitted"
  | "cadet_rejected"
  | "cadet_approved"
  | "officer_rejected"
  | "officer_approved"
  | "invalid";

export type ComplaintComplainantStatus = "pending" | "approved" | "rejected";

export interface ComplaintComplainant {
  user_id: number;
  status: ComplaintComplainantStatus;
}

export interface ComplaintListItem {
  id: number;
  title: string;
  crime_level: CrimeLevel;
  current_status: ComplaintStatus;
  invalid_attempts: number;
  created_by: number;
  submitted_at: string;
  updated_at: string;
  complainants: ComplaintComplainant[];
}

export interface ComplaintDetail {
  id: number;
  title: string;
  description: string;
  crime_level: CrimeLevel;
  current_status: ComplaintStatus;
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
  complainants: ComplaintComplainant[];
}

export interface ComplaintCreatePayload {
  title: string;
  description: string;
  crime_level: CrimeLevel;
  additional_complainant_ids?: number[];
}

export interface ComplaintResubmitPayload {
  title?: string;
  description?: string;
  crime_level?: CrimeLevel;
}

export interface CadetReviewPayload {
  decision: "approve" | "reject";
  message?: string;
  approve_complainant_ids?: number[];
  reject_complainant_ids?: number[];
}

export interface OfficerReviewPayload {
  decision: "approve" | "reject";
  message?: string;
}

export function listComplaints(): Promise<ComplaintListItem[]> {
  return apiRequest<ComplaintListItem[]>(endpoints.complaints, { method: "GET" });
}

export function createComplaint(payload: ComplaintCreatePayload): Promise<ComplaintDetail> {
  return apiRequest<ComplaintDetail>(endpoints.complaints, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getComplaint(complaintId: number | string): Promise<ComplaintDetail> {
  return apiRequest<ComplaintDetail>(endpoints.complaintDetail(complaintId), { method: "GET" });
}

export function resubmitComplaint(
  complaintId: number | string,
  payload: ComplaintResubmitPayload
): Promise<ComplaintDetail> {
  return apiRequest<ComplaintDetail>(endpoints.complaintResubmit(complaintId), {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function cadetReviewComplaint(
  complaintId: number | string,
  payload: CadetReviewPayload
): Promise<ComplaintDetail> {
  return apiRequest<ComplaintDetail>(endpoints.complaintCadetReview(complaintId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function officerReviewComplaint(
  complaintId: number | string,
  payload: OfficerReviewPayload
): Promise<ComplaintDetail> {
  return apiRequest<ComplaintDetail>(endpoints.complaintOfficerReview(complaintId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
