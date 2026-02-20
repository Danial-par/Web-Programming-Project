import React from "react";
import { Link } from "react-router-dom";
import { useAuthContext } from "../auth/AuthContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { getVisibleModules } from "../config/dashboardModules";

export const DashboardPage: React.FC = () => {
  const { user, isBootstrapping } = useAuthContext();

  if (isBootstrapping || !user) {
    return <PageSkeleton />;
  }

  const visibleModules = getVisibleModules(user.roles ?? []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.username}.</p>

      <div className="dashboard-modules" style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}>
        {visibleModules.length === 0 ? (
          <Card>
            <p style={{ color: "var(--text-muted)" }}>
              No modules available. Contact an administrator to assign roles.
            </p>
          </Card>
        ) : (
          visibleModules.map((module) => (
            <Card key={module.id} title={module.title}>
              <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                {module.description}
              </p>
              <Link to={module.path}>
                <Button variant="primary">Open {module.title}</Button>
              </Link>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

