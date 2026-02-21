import React from "react";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";

export const CasesPage: React.FC = () => {
  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Cases</h1>
          <p className="workflow-muted">Future work: list, filter, and manage cases for authorized users.</p>
        </div>
        <BackToDashboardButton />
      </section>
    </div>
  );
};
