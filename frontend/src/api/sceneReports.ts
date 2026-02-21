import { apiRequest } from "./client";
import { CrimeLevel } from "./complaints";
import { endpoints } from "./endpoints";

export type SceneReportStatus = "pending" | "approved";

export interface SceneWitness {
  phone: string;
  national_id: string;
}

export interface SceneReportCase {
  id: number;
  title: string;
  description: string;
  crime_level: CrimeLevel;
  status: string;
  created_by: number;
  formed_at?: string | null;
  [key: string]: unknown;
}

export interface SceneReportListItem {
  id: number;
  case_id: number;
  scene_datetime: string;
  status: SceneReportStatus;
  created_by: number;
  created_at: string;
  approved_by: number | null;
  approved_at: string | null;
}

export interface SceneReportDetail {
  id: number;
  case: SceneReportCase;
  scene_datetime: string;
  status: SceneReportStatus;
  created_by: number;
  created_at: string;
  approved_by: number | null;
  approved_at: string | null;
  witnesses: SceneWitness[];
}

export interface SceneReportCreatePayload {
  title: string;
  description: string;
  crime_level: CrimeLevel;
  scene_datetime: string;
  witnesses?: SceneWitness[];
}

export function listSceneReports(): Promise<SceneReportListItem[]> {
  return apiRequest<SceneReportListItem[]>(endpoints.sceneReports, { method: "GET" });
}

export function createSceneReport(payload: SceneReportCreatePayload): Promise<SceneReportDetail> {
  return apiRequest<SceneReportDetail>(endpoints.sceneReports, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getSceneReport(sceneReportId: number | string): Promise<SceneReportDetail> {
  return apiRequest<SceneReportDetail>(endpoints.sceneReportDetail(sceneReportId), { method: "GET" });
}

export function approveSceneReport(sceneReportId: number | string): Promise<SceneReportDetail> {
  return apiRequest<SceneReportDetail>(endpoints.sceneReportApprove(sceneReportId), {
    method: "POST",
    body: JSON.stringify({})
  });
}
