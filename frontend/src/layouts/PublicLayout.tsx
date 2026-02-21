import React from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuthContext } from "../auth/AuthContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

export const PublicLayout: React.FC = () => {
  const { user, logout } = useAuthContext();

  return (
    <div className="app-shell app-shell--public">
      <header className="app-header">
        <div className="app-header__brand">L.A. Noire Police Portal</div>
        <nav className="app-header__nav">
          <Link to="/">Home</Link>
          <Link to="/most-wanted">Most Wanted</Link>
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <Button variant="ghost" type="button" onClick={logout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>

      <main className="app-main">
        <Card>
          <Outlet />
        </Card>
      </main>
    </div>
  );
};