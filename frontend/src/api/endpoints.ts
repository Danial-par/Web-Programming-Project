// Central place to define backend endpoint paths used by the frontend.

export const endpoints = {
  auth: {
    login: "/auth/login/",
    register: "/auth/register/",
    me: "/auth/me/"
  },
  mostWanted: "/most-wanted/",
  statsOverview: "/stats/overview/",
  // These module endpoints will be wired in later steps
  cases: "/cases/",
  complaints: "/complaints/",
  evidence: "/evidence/",
  boardForCase: (caseId: number | string) => `/cases/${caseId}/board/`
};

