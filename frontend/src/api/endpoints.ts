// Central place to define backend endpoint paths used by the frontend.

export const endpoints = {
  auth: {
    login: "/auth/login/",
    register: "/auth/register/",
    me: "/auth/me/"
  },
  mostWanted: "/most-wanted/",
  statsOverview: "/stats/overview/",
  // Core module endpoints
  cases: "/cases/",
  complaints: "/complaints/",
  complaintDetail: (complaintId: number | string) => `/complaints/${complaintId}/`,
  complaintResubmit: (complaintId: number | string) => `/complaints/${complaintId}/resubmit/`,
  complaintCadetReview: (complaintId: number | string) => `/complaints/${complaintId}/cadet-review/`,
  complaintOfficerReview: (complaintId: number | string) => `/complaints/${complaintId}/officer-review/`,
  sceneReports: "/scene-reports/",
  sceneReportDetail: (sceneReportId: number | string) => `/scene-reports/${sceneReportId}/`,
  sceneReportApprove: (sceneReportId: number | string) => `/scene-reports/${sceneReportId}/approve/`,
  evidence: "/evidence/",
  boardForCase: (caseId: number | string) => `/cases/${caseId}/board/`
};
