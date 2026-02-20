import React from "react";
import { useParams } from "react-router-dom";

export const BoardPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

  return (
    <div>
      <h1>Detective Board</h1>
      <p>Placeholder for the interactive detective board for case ID: {caseId}</p>
    </div>
  );
};

