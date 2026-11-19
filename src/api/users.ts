import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the USERS & ROLES module (fase 10 · ADR-020).
 * The invitation token is returned ONCE in the API response (foundation has
 * no SMTP): the admin shares it through their own channel. Every call
 * carries the ACTIVE tenant header (the backend re-verifies membership
 * inside RLS on each request and enforces permissions server-side).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

export interface MemberRoleRef {
  readonly roleId: string;
  readonly roleName: string;
}

export interface MemberView {
  readonly membershipId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: "PENDING" | "ACTIVE" | "REVOKED";
  readonly roles: readonly MemberRoleRef[];
  readonly invitationPending: boolean;
  readonly invitedAt: string | null;
  readonly acceptedAt: string | null;
}

export interface InviteOutcome {
  readonly member: MemberView;
  readonly invitationToken: string;
}

export interface AcceptInvitationOutcome {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly email: string;
  readonly displayName: string;
}

export function listMembers(): Promise<readonly MemberView[]> {
  return apiGet<readonly MemberView[]>("/api/v1/users", { headers: tenantHeaders() });
}

export function inviteMember(command: {
  readonly email: string;
  readonly displayName?: string;
  readonly roleIds: readonly string[];
}): Promise<InviteOutcome> {
  return apiJson<InviteOutcome>("/api/v1/users/invitations", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

export function resendInvitation(membershipId: string): Promise<InviteOutcome> {
  return apiJson<InviteOutcome>(`/api/v1/users/invitations/${membershipId}/resend`, {
    method: "POST",
    headers: tenantHeaders(),
  });
}

export function changeMemberRoles(membershipId: string, roleIds: readonly string[]): Promise<MemberView> {
  return apiJson<MemberView>(`/api/v1/users/${membershipId}`, {
    method: "PATCH",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ roleIds }),
  });
}

export function revokeMember(membershipId: string): Promise<MemberView> {
  return apiJson<MemberView>(`/api/v1/users/${membershipId}/revoke`, {
    method: "POST",
    headers: tenantHeaders(),
  });
}

export interface RoleView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly system: boolean;
  readonly permissions: readonly string[];
}

export interface PermissionView {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

export function listRoles(): Promise<readonly RoleView[]> {
  return apiGet<readonly RoleView[]>("/api/v1/roles", { headers: tenantHeaders() });
}

export function listPermissionCatalog(): Promise<readonly PermissionView[]> {
  return apiGet<readonly PermissionView[]>("/api/v1/permissions", { headers: tenantHeaders() });
}

export function createRole(command: {
  readonly name: string;
  readonly description?: string;
  readonly permissions: readonly string[];
}): Promise<RoleView> {
  return apiJson<RoleView>("/api/v1/roles", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

export function updateRole(
  roleId: string,
  command: {
    readonly name?: string;
    readonly description?: string;
    readonly permissions?: readonly string[];
  },
): Promise<RoleView> {
  return apiJson<RoleView>(`/api/v1/roles/${roleId}`, {
    method: "PATCH",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

export function deleteRole(roleId: string): Promise<void> {
  return apiJson<void>(`/api/v1/roles/${roleId}`, {
    method: "DELETE",
    headers: tenantHeaders(),
  });
}

/** PUBLIC (no session): consumes the invitation token. */
export function acceptInvitation(command: {
  readonly token: string;
  readonly password: string;
}): Promise<AcceptInvitationOutcome> {
  return apiJson<AcceptInvitationOutcome>("/api/v1/auth/invitations/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}
