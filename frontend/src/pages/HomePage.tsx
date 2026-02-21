import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchStatsOverview } from "../api/public";
import { useAuthContext } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { StatCardSkeleton } from "../components/ui/StatCardSkeleton";
import { Alert } from "../components/ui/Alert";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatNumber } from "../utils/format";

export const HomePage: React.FC = () => {
  const { user } = useAuthContext();

  const {
    data: stats,
    isLoading,
    error,
    refetch
  } = useAsyncData(fetchStatsOverview, []);

  const actions = useMemo(() => {
    if (user) {
      return (
        <div className="public-hero__actions">
          <Link to="/dashboard">
            <Button>Open Dashboard</Button>
          </Link>
          <Link to="/most-wanted">
            <Button variant="secondary">View Most Wanted</Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="public-hero__actions">
        <Link to="/login">
          <Button>Login</Button>
        </Link>
        <Link to="/register">
          <Button variant="secondary">Create Account</Button>
        </Link>
        <Link to="/most-wanted">
          <Button variant="ghost">View Most Wanted</Button>
        </Link>
      </div>
    );
  }, [user]);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <section className="public-hero">
        <h1 className="public-hero__title">L.A. Noire Police Automation System</h1>
        <p className="public-hero__subtitle">
          A unified portal for submitting complaints, managing cases, registering evidence, and supporting investigative
          collaboration. This public area provides transparency through live system metrics and a high‑priority Most Wanted
          list.
        </p>
        {actions}
      </section>

      <section>
        <h2 style={{ margin: 0 }}>Live overview</h2>
        <p style={{ marginTop: "0.35rem", marginBottom: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>
          These numbers are fetched from the backend in real time.
        </p>

        {error && (
          <div style={{ marginTop: "1rem" }}>
            <Alert
              variant="error"
              title="We couldn’t load the overview stats"
              actions={
                <Button variant="secondary" type="button" onClick={refetch}>
                  Retry
                </Button>
              }
            >
              Please check your connection or try again. If the problem persists, the API might be down.
            </Alert>
          </div>
        )}

        <div className="stats-grid">
          {isLoading && (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          )}

          {!isLoading && stats && (
            <>
              <StatCard
                label="Solved cases"
                value={formatNumber(stats.solved_cases_count)}
                hint="Closed cases successfully resolved."
              />
              <StatCard
                label="Active cases"
                value={formatNumber(stats.active_cases_count)}
                hint="Currently under investigation."
              />
              <StatCard
                label="Employees"
                value={formatNumber(stats.employees_count)}
                hint="Total registered staff in the system."
              />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ margin: 0 }}>Need to report something?</h2>
        <p style={{ marginTop: "0.35rem", marginBottom: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Use your account to submit complaints and track their status. You can also browse the Most Wanted list without
          logging in.
        </p>
      </section>
    </div>
  );
};