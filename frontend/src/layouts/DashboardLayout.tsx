import React, { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuthContext } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";
import { NotificationsMenu } from "../components/notifications/NotificationsMenu";

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "Officer";
  const rolesDisplay = user?.roles && user.roles.length > 0 ? user.roles.join(", ") : "No roles assigned";
  const isAdmin = !!user?.roles?.includes("Admin");
  const canRewardLookup =
    !!user?.roles?.some((r) =>
      ["Admin", "Chief", "Captain", "Sergeant", "Detective", "Police Officer", "Patrol Officer"].includes(r)
    );

  return (
    <div className="app-shell app-shell--dashboard">
      <aside className={`app-sidebar ${sidebarOpen ? "app-sidebar--open" : ""}`}>
        <div className="app-sidebar__brand">L.A. Noire</div>
        <div className="app-sidebar__user">
          <div className="app-sidebar__user-name">{fullName}</div>
          <div className="app-sidebar__user-roles">{rolesDisplay}</div>
        </div>
        <nav className="app-sidebar__nav">
          <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
            Dashboard
          </Link>
          <Link to="/" onClick={() => setSidebarOpen(false)}>
            Public Home
          </Link>
          <Link to="/most-wanted" onClick={() => setSidebarOpen(false)}>
            Most Wanted
          </Link>
          <Link to="/cases" onClick={() => setSidebarOpen(false)}>
            Cases
          </Link>
          <Link to="/complaints" onClick={() => setSidebarOpen(false)}>
            Complaints
          </Link>
          <Link to="/scene-reports" onClick={() => setSidebarOpen(false)}>
            Scene Reports
          </Link>
          <Link to="/evidence" onClick={() => setSidebarOpen(false)}>
            Evidence
          </Link>
          <Link to="/tips" onClick={() => setSidebarOpen(false)}>
            Tips / Rewards
          </Link>
          <Link to="/bail-fine" onClick={() => setSidebarOpen(false)}>
            Bail & Fine
          </Link>
          <Link to="/reports" onClick={() => setSidebarOpen(false)}>
            Reports
          </Link>
          {isAdmin && (
            <Link to="/admin" onClick={() => setSidebarOpen(false)}>
              Admin
            </Link>
          )}
          {canRewardLookup && (
            <Link to="/rewards/lookup" onClick={() => setSidebarOpen(false)}>
              Reward Lookup
            </Link>
          )}
          {canRewardLookup && (
            <Link to="/tips/review" onClick={() => setSidebarOpen(false)}>
              Tips Review
            </Link>
          )}
        </nav>
        <button className="app-sidebar__logout" type="button" onClick={logout}>
          Logout
        </button>
      </aside>

      <div className="app-content-wrapper">
        <header className="app-topbar">
          <button
            className="app-topbar__menu-toggle"
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>

          <div className="app-topbar__user">
            <span className="app-topbar__user-name">{fullName}</span>
            <span className="app-topbar__user-roles">{rolesDisplay}</span>
          </div>

          {/* Step 7: Notifications */}
          <NotificationsMenu />

          <Button variant="ghost" type="button" onClick={logout} className="app-topbar__logout">
            Logout
          </Button>
        </header>

        <main className="app-main app-main--dashboard">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div className="app-sidebar__overlay" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
    </div>
  );
};
