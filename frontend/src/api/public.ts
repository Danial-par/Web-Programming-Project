import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export interface StatsOverview {
  solved_cases_count: number;
  employees_count: number;
  active_cases_count: number;
}

export interface MostWantedItem {
  suspect_id: number;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  photo: string | null;
  max_days_wanted: number;
  max_crime_degree: number;
  ranking: number;
  reward_amount: number;
}

function withQuery(path: string, query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });

  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${params.toString() ? joiner + params.toString() : ""}`;
}

export function fetchStatsOverview(): Promise<StatsOverview> {
  return apiRequest<StatsOverview>(endpoints.statsOverview);
}

export function fetchMostWanted(limit = 10): Promise<MostWantedItem[]> {
  return apiRequest<MostWantedItem[]>(withQuery(endpoints.mostWanted, { limit }));
}