import React, { useState } from "react";
import {
  listRoles,
  createRole,
  deleteRole,
  listUsers,
  assignRole,
  removeRole,
  type Role,
  type AdminUser,
} from "../api/admin";
import { ApiError } from "../api/client";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { TextInput } from "../components/ui/TextInput";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { useToast } from "../utils/toast";

export const AdminPage: React.FC = () => {
  const { showError, showSuccess } = useToast();

  const { data: roles, isLoading: rolesLoading, error: rolesError, refetch: refetchRoles } = useAsyncData(listRoles, []);
  const [newRoleName, setNewRoleName] = useState("");
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const { data: users, isLoading: usersLoading, error: usersError, refetch: refetchUsers } = useAsyncData(
    () => listUsers({ q: userSearch || undefined }),
    [userSearch]
  );
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [assignRoleName, setAssignRoleName] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingRole, setRemovingRole] = useState<string | null>(null);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) {
      showError("Role name is required.");
      return;
    }
    setIsCreatingRole(true);
    try {
      await createRole(name);
      showSuccess(`Role "${name}" created.`);
      setNewRoleName("");
      await refetchRoles();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to create role.");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (!window.confirm(`Delete role "${role.name}"? This does not remove it from users; they will just no longer have this group.`)) return;
    setDeletingId(role.id);
    try {
      await deleteRole(role.id);
      showSuccess(`Role "${role.name}" deleted.`);
      await refetchRoles();
      if (selectedUser && selectedUser.roles.includes(role.name)) {
        setSelectedUser({ ...selectedUser, roles: selectedUser.roles.filter((r) => r !== role.name) });
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to delete role.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !assignRoleName.trim()) return;
    setIsAssigning(true);
    try {
      const updated = await assignRole(selectedUser.id, assignRoleName.trim());
      showSuccess(`Role "${assignRoleName.trim()}" assigned to ${updated.username}.`);
      setSelectedUser(updated);
      setAssignRoleName("");
      await refetchUsers();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to assign role.");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveRole = async (user: AdminUser, roleName: string) => {
    setRemovingRole(roleName);
    try {
      const updated = await removeRole(user.id, roleName);
      showSuccess(`Role "${roleName}" removed from ${updated.username}.`);
      if (selectedUser?.id === user.id) setSelectedUser(updated);
      await refetchUsers();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : "Failed to remove role.");
    } finally {
      setRemovingRole(null);
    }
  };

  const roleOptions = (roles ?? []).map((r) => ({ value: r.name, label: r.name }));

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>Admin Panel</h1>
          <p className="workflow-muted">Manage roles and assign them to users. Admin-only.</p>
        </div>
        <BackToDashboardButton />
      </section>

      <Card title="Roles">
        <p className="workflow-muted" style={{ marginBottom: "1rem" }}>
          Create and delete role names (Django groups). Assign them to users in the section below.
        </p>

        {rolesError && (
          <Alert variant="error" title="Failed to load roles" actions={<Button variant="secondary" onClick={refetchRoles}>Retry</Button>}>
            {rolesError.message}
          </Alert>
        )}

        <form onSubmit={handleCreateRole} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <TextInput
            label="New role name"
            name="newRole"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="e.g. Cadet"
          />
          <Button type="submit" disabled={isCreatingRole}>{isCreatingRole ? "Creating..." : "Create role"}</Button>
        </form>

        {rolesLoading && <TableSkeleton rows={3} columns={2} />}
        {!rolesLoading && roles && (
          <div style={{ marginTop: "1rem" }}>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 ? (
                  <tr><td colSpan={3} className="ui-table__empty">No roles yet. Create one above.</td></tr>
                ) : (
                  roles.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.name}</td>
                      <td>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => handleDeleteRole(r)}
                          disabled={deletingId === r.id}
                        >
                          {deletingId === r.id ? "Deleting..." : "Delete"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="User role assignment">
        <p className="workflow-muted" style={{ marginBottom: "1rem" }}>
          Search users, select one, then assign or remove roles.
        </p>

        <div style={{ marginBottom: "1rem" }}>
          <TextInput
            label="Search users (username, email, name)"
            name="userSearch"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Type to search..."
          />
        </div>

        {usersError && (
          <Alert variant="error" title="Failed to load users" actions={<Button variant="secondary" onClick={refetchUsers}>Retry</Button>}>
            {usersError.message}
          </Alert>
        )}

        {usersLoading && <TableSkeleton rows={5} columns={4} />}
        {!usersLoading && users && (
          <>
            <table className="ui-table" style={{ marginBottom: "1.5rem" }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={5} className="ui-table__empty">No users found.</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                      <td>{u.roles.length ? u.roles.join(", ") : "—"}</td>
                      <td>
                        <Button variant="secondary" type="button" onClick={() => setSelectedUser(u)}>
                          Manage roles
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {selectedUser && (
              <Card title={`Assign / remove roles: ${selectedUser.username}`}>
                <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                  Current roles: {selectedUser.roles.length ? selectedUser.roles.join(", ") : "None"}
                </p>
                <form onSubmit={handleAssignRole} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Select
                    label="Role to assign"
                    name="assignRole"
                    value={assignRoleName}
                    onChange={(e) => setAssignRoleName(e.target.value)}
                    options={roleOptions}
                  />
                  <Button type="submit" disabled={isAssigning || !assignRoleName.trim()}>
                    {isAssigning ? "Assigning..." : "Assign role"}
                  </Button>
                </form>
                {selectedUser.roles.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <span className="ui-field__label" style={{ display: "block", marginBottom: "0.5rem" }}>Remove role</span>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {selectedUser.roles.map((r) => (
                        <Button
                          key={r}
                          variant="ghost"
                          type="button"
                          onClick={() => handleRemoveRole(selectedUser, r)}
                          disabled={removingRole === r}
                        >
                          {removingRole === r ? "Removing..." : `Remove ${r}`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="ghost" type="button" onClick={() => setSelectedUser(null)} style={{ marginTop: "1rem" }}>
                  Close
                </Button>
              </Card>
            )}
          </>
        )}
      </Card>
    </div>
  );
};
