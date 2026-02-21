import React from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";

export const CaseSuspectsPlaceholderPage: React.FC = () => {
  const params = useParams();
  const caseId = params.caseId;

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Case Suspects & Interrogation</h1>
          <p className="workflow-muted">This area will be implemented in Step 7.</p>
        </div>
        <div className="workflow-actions">
          <Link to={caseId ? `/cases/${caseId}` : "/cases"}>
            <Button type="button" variant="secondary">
              Back to Case
            </Button>
          </Link>
        </div>
      </section>

      <Alert variant="info" title="Step 7 pending">
        Suspect proposal/review and interrogation scoring flows are planned for Step 7. Use this link path to keep
        module navigation consistent.
      </Alert>
    </div>
  );
};
