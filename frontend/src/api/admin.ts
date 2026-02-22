import { apiRequest } from "./client";
import { endpoints } from "./endpoints";

export interface Role {
  id: number;
  name: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  phone: string;
  national_id: string;
  first_name: string;
  last_name: string;
  roles: string[];
}

export function listRoles(): Promise<Role[]> {
  return apiRequest<Role[]>(endpoints.roles, { method: "GET" });
}

export function createRole(name: string): Promise<Role> {
  return apiRequest<Role>(endpoints.roles, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteRole(roleId: number): Promise<void> {
  return apiRequest<void>(endpoints.roleDetail(roleId), { method: "DELETE" });
}

export function listUsers(params?: { q?: string }): Promise<AdminUser[]> {
  const searchParams = new URLSearchParams();
  if (params?.q?.trim()) searchParams.set("q", params.q.trim());
  const query = searchParams.toString();
  const path = query ? `${endpoints.users}?${query}` : endpoints.users;
  return apiRequest<AdminUser[]>(path, { method: "GET" });
}

export function getUser(userId: number | string): Promise<AdminUser> {
  return apiRequest<AdminUser>(endpoints.userDetail(userId), { method: "GET" });
}

export function assignRole(userId: number | string, roleName: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(endpoints.userAssignRole(userId), {
    method: "POST",
    body: JSON.stringify({ name: roleName }),
  });
}

export function removeRole(userId: number | string, roleName: string): Promise<AdminUser> {
  return apiRequest<AdminUser>(endpoints.userRemoveRole(userId), {
    method: "POST",
    body: JSON.stringify({ name: roleName }),
  });
}
