import React from "react";
import { Link } from "react-router-dom";
import { Button } from "./Button";

export const BackToDashboardButton: React.FC = () => {
  return (
    <Link to="/dashboard">
      <Button type="button" variant="secondary">
        Back to Dashboard
      </Button>
    </Link>
  );
};
