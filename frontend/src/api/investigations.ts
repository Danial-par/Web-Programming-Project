import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export interface Position {
  x: number;
  y: number;
}

// -----------------------------------------------------------------------------
// Detective board
// -----------------------------------------------------------------------------

export type BoardItemKind = "note" | "evidence";

export interface EvidenceBrief {
  id: number;
  type: string;
  title: string;
}

export interface BoardItem {
  id: number;
  kind: BoardItemKind;
  evidence: EvidenceBrief | null;
  note_text: string;
  position: Position;
  created_at: string;
  updated_at: string;
}

export interface BoardConnection {
  id: number;
  from_item: number;
  to_item: number;
  created_at: string;
}

export interface DetectiveBoardState {
  id: number;
  case: number;
  items: BoardItem[];
  connections: BoardConnection[];
  created_at: string;
  updated_at: string;
}

export interface BoardItemCreatePayload {
  kind: BoardItemKind;
  note_text?: string;
  evidence_id?: number;
  position: Position;
}

export function getCaseBoard(caseId: number | string): Promise<DetectiveBoardState> {
  return apiRequest<DetectiveBoardState>(endpoints.boardForCase(caseId), { method: "GET" });
}

export function createBoardItem(caseId: number | string, payload: BoardItemCreatePayload): Promise<BoardItem> {
  return apiRequest<BoardItem>(endpoints.boardItemsForCase(caseId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function moveBoardItem(
  caseId: number | string,
  itemId: number | string,
  position: Position
): Promise<BoardItem> {
  return apiRequest<BoardItem>(endpoints.boardItem(caseId, itemId), {
    method: "PATCH",
    body: JSON.stringify({ position })
  });
}

export async function deleteBoardItem(caseId: number | string, itemId: number | string): Promise<void> {
  await apiRequest<null>(endpoints.boardItem(caseId, itemId), {
    method: "DELETE"
  });
}

export function createBoardConnection(
  caseId: number | string,
  payload: { from_item: number; to_item: number }
): Promise<BoardConnection> {
  return apiRequest<BoardConnection>(endpoints.boardConnectionsForCase(caseId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteBoardConnection(
  caseId: number | string,
  connectionId: number | string
): Promise<void> {
  await apiRequest<null>(endpoints.boardConnection(caseId, connectionId), {
    method: "DELETE"
  });
}

// -----------------------------------------------------------------------------
// Suspects
// -----------------------------------------------------------------------------

export type CaseSuspectStatus = "proposed" | "approved" | "rejected";

export interface CaseSuspect {
  id: number;
  case: number;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  notes: string;
  photo: string | null;
  proposed_by: number | null;
  proposed_by_username: string;
  proposed_at: string;
  status: CaseSuspectStatus;
  sergeant_message: string;
  reviewed_by: number | null;
  reviewed_by_username: string;
  reviewed_at: string | null;
}

export interface CaseSuspectProposePayload {
  first_name: string;
  last_name: string;
  national_id?: string;
  phone?: string;
  notes?: string;
}

export function proposeSuspect(caseId: number | string, payload: CaseSuspectProposePayload): Promise<CaseSuspect> {
  return apiRequest<CaseSuspect>(endpoints.suspectPropose(caseId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type SuspectReviewDecision = "approve" | "reject";

export function reviewSuspect(
  caseId: number | string,
  suspectId: number | string,
  payload: { decision: SuspectReviewDecision; message?: string }
): Promise<CaseSuspect> {
  return apiRequest<CaseSuspect>(endpoints.suspectReview(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// -----------------------------------------------------------------------------
// Interrogation
// -----------------------------------------------------------------------------

export interface Interrogation {
  id: number;
  suspect: number;
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

export function submitDetectiveInterrogationScore(
  caseId: number | string,
  suspectId: number | string,
  detective_score: number
): Promise<Interrogation> {
  return apiRequest<Interrogation>(endpoints.suspectInterrogationDetective(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify({ detective_score })
  });
}

export function submitSergeantInterrogationScore(
  caseId: number | string,
  suspectId: number | string,
  sergeant_score: number
): Promise<Interrogation> {
  return apiRequest<Interrogation>(endpoints.suspectInterrogationSergeant(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify({ sergeant_score })
  });
}

export function submitCaptainDecision(
  caseId: number | string,
  suspectId: number | string,
  payload: { captain_final_decision: boolean; captain_reasoning?: string }
): Promise<Interrogation> {
  return apiRequest<Interrogation>(endpoints.suspectInterrogationCaptain(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitChiefReview(
  caseId: number | string,
  suspectId: number | string,
  payload: { chief_decision: boolean; chief_message?: string }
): Promise<Interrogation> {
  return apiRequest<Interrogation>(endpoints.suspectInterrogationChief(caseId, suspectId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------

export interface NotificationRecord {
  id: number;
  case: number;
  case_title: string;
  message: string;
  created_at: string;
  read_at: string | null;
}

export function listNotifications(options?: { unread?: boolean }): Promise<NotificationRecord[]> {
  const unread = options?.unread;
  const path = unread ? `${endpoints.notifications}?unread=1` : endpoints.notifications;
  return apiRequest<NotificationRecord[]>(path, { method: "GET" });
}

export type TipStatus =
  | "submitted"
  | "officer_rejected"
  | "forwarded_to_detective"
  | "detective_rejected"
  | "approved";

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
  officer_message: string;
  detective_message: string;
  created_at: string;
}

export function createTip(payload: { case?: number; suspect?: number; details: string }): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tips, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function officerReviewTip(
  tipId: number | string,
  payload: { decision: "reject" | "forward"; message?: string }
): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tipOfficerReview(tipId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function detectiveReviewTip(
  tipId: number | string,
  payload: { decision: "approve" | "reject"; message?: string }
): Promise<TipRecord> {
  return apiRequest<TipRecord>(endpoints.tipDetectiveReview(tipId), {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export interface RewardLookupResult {
  reward_code: string;
  reward_amount: number;
  created_at: string;
  tip_user: {
    id: number;
    national_id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
}

export function lookupReward(payload: { national_id: string; reward_code: string }): Promise<RewardLookupResult> {
  return apiRequest<RewardLookupResult>(endpoints.rewardLookup, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}