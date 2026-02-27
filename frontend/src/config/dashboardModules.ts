import { ReactNode } from "react";

export interface DashboardModule {
  id: string;
  title: string;
  description: string;
  path: string;
  icon?: ReactNode;
  requiredRoles: string[];
}

export const dashboardModules: DashboardModule[] = [
  {
    id: "cases",
    title: "Cases",
    description: "View and manage active cases, track case status and assignments.",
    path: "/cases",
    requiredRoles: []
  },
  {
    id: "complaints",
    title: "Complaints",
    description: "Submit and review complaints, track complaint workflow status.",
    path: "/complaints",
    requiredRoles: []
  },
  {
    id: "scene-reports",
    title: "Scene Reports",
    description: "Create and review scene reports that can form and activate cases.",
    path: "/scene-reports",
    requiredRoles: []
  },
  {
    id: "evidence",
    title: "Evidence",
    description: "Register and manage evidence records, attach files and documents.",
    path: "/evidence",
    requiredRoles: []
  },
  {
    id: "board",
    title: "Detective Board",
    description: "Interactive board for connecting evidence and building case theories.",
    path: "/cases",
    requiredRoles: ["Detective"]
  },
  {
    id: "reports",
    title: "Reports",
    description: "View comprehensive case reports, trial outcomes, and summaries.",
    path: "/reports",
    requiredRoles: ["Captain", "Chief", "Judge"]
  },
  {
    id: "admin",
    title: "Admin Panel",
    description: "Manage roles, users, and system configuration.",
    path: "/admin",
    requiredRoles: ["Admin"]
  },
  {
    id: "tips",
    title: "Tips / Rewards",
    description: "Submit tips and view your reward code after approval.",
    path: "/tips",
    requiredRoles: []
  },
  {
    id: "tips-review",
    title: "Tips Review",
    description: "Officer/detective review queue for tips (forward, approve, reject).",
    path: "/tips/review",
    requiredRoles: ["Admin", "Chief", "Captain", "Sergeant", "Detective", "Police Officer", "Patrol Officer"]
  },
  {
    id: "reward-lookup",
    title: "Reward Lookup",
    description: "Verify rewards using national ID and reward code.",
    path: "/rewards/lookup",
    requiredRoles: ["Admin", "Chief", "Captain", "Sergeant", "Detective", "Police Officer", "Patrol Officer"]
  },
  {
    id: "most-wanted",
    title: "Most Wanted",
    description: "Public list of high-priority suspects with reward information.",
    path: "/most-wanted",
    requiredRoles: []
  },
  {
    id: "bail-fine",
    title: "Bail & Fine",
    description: "Lookup suspect release info and start bail/fine payments.",
    path: "/bail-fine",
    requiredRoles: []
  }
];

export function getVisibleModules(userRoles: string[]): DashboardModule[] {
  return dashboardModules.filter((module) => {
    if (module.requiredRoles.length === 0) return true;
    return module.requiredRoles.some((role) => userRoles.includes(role));
  });
}
