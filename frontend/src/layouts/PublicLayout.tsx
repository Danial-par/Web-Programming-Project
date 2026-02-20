import React from "react";
import { Link, Outlet } from "react-router-dom";
import { Card } from "../components/ui/Card";

export const PublicLayout: React.FC = () => {
  return (
    <div className="app-shell app-shell--public">
      <header className="app-header">
        <div className="app-header__brand">L.A. Noire Police Portal</div>
        <nav className="app-header__nav">
          <Link to="/">Home</Link>
          <Link to="/most-wanted">Most Wanted</Link>
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
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

