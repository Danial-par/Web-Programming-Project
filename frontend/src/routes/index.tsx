import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { PublicLayout } from "../layouts/PublicLayout";
import { DashboardLayout } from "../layouts/DashboardLayout";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { MostWantedPage } from "../pages/MostWantedPage";
import { DashboardPage } from "../pages/DashboardPage";
import { CasesPage } from "../pages/CasesPage";
import { CaseDetailPage } from "../pages/CaseDetailPage";
import { CaseSuspectsPage } from "../pages/CaseSuspectsPage";
import { ComplaintsPage } from "../pages/ComplaintsPage";
import { EvidencePage } from "../pages/EvidencePage";
import { EvidenceDetailPage } from "../pages/EvidenceDetailPage";
import { BoardPage } from "../pages/BoardPage";
import { ReportsPage } from "../pages/ReportsPage";
import { AdminPage } from "../pages/AdminPage";
import { RequireAuth } from "../auth/RequireAuth";
import { RoleGuard } from "../auth/rbac";
import { ComplaintDetailPage } from "../pages/ComplaintDetailPage";
import { SceneReportsPage } from "../pages/SceneReportsPage";
import { SceneReportCreatePage } from "../pages/SceneReportCreatePage";
import { SceneReportDetailPage } from "../pages/SceneReportDetailPage";
import { TipsPage } from "../pages/TipsPage";
import { RewardLookupPage } from "../pages/RewardLookupPage";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/most-wanted" element={<MostWantedPage />} />
      </Route>

      {/* Protected routes */}
      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="/cases/:caseId/suspects" element={<CaseSuspectsPage />} />
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="/tips" element={<TipsPage />} />
        <Route
          path="/rewards/lookup"
          element={
            <RoleGuard
              roles={["Admin", "Chief", "Captain", "Sergeant", "Detective", "Police Officer", "Patrol Officer"]}
              fallback={<Navigate to="/dashboard" replace />}
            >
              <RewardLookupPage />
            </RoleGuard>
          }
        />
        <Route path="/complaints/:complaintId" element={<ComplaintDetailPage />} />
        <Route path="/scene-reports" element={<SceneReportsPage />} />
        <Route path="/scene-reports/new" element={<SceneReportCreatePage />} />
        <Route path="/scene-reports/:sceneReportId" element={<SceneReportDetailPage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/evidence/:evidenceId" element={<EvidenceDetailPage />} />
        <Route path="/board/:caseId" element={<BoardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route
          path="/admin"
          element={
            <RoleGuard roles={["Admin"]} fallback={<Navigate to="/dashboard" replace />}>
              <AdminPage />
            </RoleGuard>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
