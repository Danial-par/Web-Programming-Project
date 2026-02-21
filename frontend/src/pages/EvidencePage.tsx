import React from "react";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";

export const EvidencePage: React.FC = () => {
  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Evidence</h1>
          <p className="workflow-muted">Future work: view and manage evidence records and attachments.</p>
        </div>
        <BackToDashboardButton />
      </section>
    </div>
  );
};
