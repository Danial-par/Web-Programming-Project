import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";

export const HomePage: React.FC = () => {
  return (
    <div>
      <h1>Welcome to L.A. Noire Police System</h1>
      <p>This is the public landing page. Future versions will show real stats and summaries.</p>
      <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
        <Link to="/login">
          <Button>Login</Button>
        </Link>
        <Link to="/most-wanted">
          <Button variant="secondary">View Most Wanted</Button>
        </Link>
      </div>
    </div>
  );
};

