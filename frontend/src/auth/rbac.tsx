import React from "react";
import { useAuthContext } from "./AuthContext";

export const useRBAC = () => {
  const { user } = useAuthContext();
  const roles = user?.roles ?? [];

  const hasRole = (roleName: string): boolean => roles.includes(roleName);

  const hasAnyRole = (roleNames: string[]): boolean =>
    roleNames.some((role) => roles.includes(role));

  return { hasRole, hasAnyRole, roles };
};

interface RoleGuardProps {
  roles: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ roles, fallback = null, children }) => {
  const { user } = useAuthContext();
  const userRoles = user?.roles ?? [];
  const allowed = roles.length === 0 || roles.some((role) => userRoles.includes(role));

  if (!allowed) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

