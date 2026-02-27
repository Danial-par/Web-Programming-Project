import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export type TipStatus =
  | "submitted"
  | "officer_rejected"
  | "forwarded_to_detective"
  | "detective_rejected"
  | "approved"
  | string;

export interface TipReward {
  reward_code: string;
  reward_amount: number;
  created_at: string;
}

export interface TipRecord {
  id: number;
  user: number;
  case: number | null;
  suspect: number | null;
  details: string;
  status: TipStatus;
  reward: TipReward | null;
  officer_message?: string;
  detective_message?: string;
  created_at: string;
  updated_at?: string;
}

export function listTips(params?: { status?: string; mine?: boolean }): Promise<TipRecord[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.mine) q.set("mine", "1");
  const url = q.toString() ? `${endpoints.tips}?${q.toString()}` : endpoints.tips;
  return apiRequest<TipRecord[]>(url, { method: "GET" });
}

export function getTip(tipId: number | string): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tipDetail(tipId), { method: "GET" });
}

export function officerReviewTip(
  tipId: number | string,
  payload: { decision: "forward" | "reject"; message?: string }
): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tipOfficerReview(tipId), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function detectiveReviewTip(
  tipId: number | string,
  payload: { decision: "approve" | "reject"; message?: string }
): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tipDetectiveReview(tipId), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}