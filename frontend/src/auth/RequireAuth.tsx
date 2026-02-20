import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "./AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isBootstrapping } = useAuthContext();
  const location = useLocation();

  if (isBootstrapping) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.95rem" }}>
        Checking session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

// Backwards-compatible alias
export const RequireAuth = ProtectedRoute;

