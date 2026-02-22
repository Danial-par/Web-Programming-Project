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
  caseDetail: (caseId: number | string) => `/cases/${caseId}/`,
  caseReport: (caseId: number | string) => `/cases/${caseId}/report/`,
  complaints: "/complaints/",
  complaintDetail: (complaintId: number | string) => `/complaints/${complaintId}/`,
  complaintResubmit: (complaintId: number | string) => `/complaints/${complaintId}/resubmit/`,
  complaintCadetReview: (complaintId: number | string) => `/complaints/${complaintId}/cadet-review/`,
  complaintOfficerReview: (complaintId: number | string) => `/complaints/${complaintId}/officer-review/`,
  sceneReports: "/scene-reports/",
  sceneReportDetail: (sceneReportId: number | string) => `/scene-reports/${sceneReportId}/`,
  sceneReportApprove: (sceneReportId: number | string) => `/scene-reports/${sceneReportId}/approve/`,
  evidence: "/evidence/",
  evidenceDetail: (evidenceId: number | string) => `/evidence/${evidenceId}/`,
  evidenceForensicResults: (evidenceId: number | string) => `/evidence/${evidenceId}/forensic-results/`,
  // Detective board
  boardForCase: (caseId: number | string) => `/cases/${caseId}/board/`,
  boardItemsForCase: (caseId: number | string) => `/cases/${caseId}/board/items/`,
  boardItem: (caseId: number | string, itemId: number | string) => `/cases/${caseId}/board/items/${itemId}/`,
  boardConnectionsForCase: (caseId: number | string) => `/cases/${caseId}/board/connections/`,
  boardConnection: (caseId: number | string, connectionId: number | string) =>
    `/cases/${caseId}/board/connections/${connectionId}/`,

  // Suspects
  suspectPropose: (caseId: number | string) => `/cases/${caseId}/suspects/propose/`,
  suspectReview: (caseId: number | string, suspectId: number | string) =>
    `/cases/${caseId}/suspects/${suspectId}/review/`,

  // Interrogation
  suspectInterrogationDetective: (caseId: number | string, suspectId: number | string) =>
    `/cases/${caseId}/suspects/${suspectId}/interrogation/detective/`,
  suspectInterrogationSergeant: (caseId: number | string, suspectId: number | string) =>
    `/cases/${caseId}/suspects/${suspectId}/interrogation/sergeant/`,
  suspectInterrogationCaptain: (caseId: number | string, suspectId: number | string) =>
    `/cases/${caseId}/suspects/${suspectId}/interrogation/captain/`,
  suspectInterrogationChief: (caseId: number | string, suspectId: number | string) =>
    `/cases/${caseId}/suspects/${suspectId}/interrogation/chief/`,

  // Notifications
  notifications: "/notifications/"
};