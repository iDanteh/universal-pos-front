import { apiGet, apiJson } from "./client";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface OrganizationRef {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly primary: boolean;
}

interface MeOutcome {
  readonly user: AuthenticatedUser;
  readonly organizations: readonly OrganizationRef[];
}

/**
 * Module-level tenant id so every API call carries the verified tenant
 * header. Set ONLY after login (the backend verifies it server-side; the
 * header is a routing hint, never an authorization mechanism).
 */
let activeTenantId: string | null = null;

export function setActiveTenant(id: string | null): void {
  activeTenantId = id;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

export function login(email: string, password: string): Promise<AuthenticatedUser> {
  return apiJson<AuthenticatedUser>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return apiJson<void>("/api/v1/auth/logout", { method: "POST" });
}

export function me(): Promise<MeOutcome> {
  return apiGet<MeOutcome>("/api/v1/auth/me");
}

export interface CurrentOrganization {
  readonly id: string;
  readonly name: string;
  readonly verticalCode: string;
}

export function currentOrganization(): Promise<CurrentOrganization> {
  const headers: Record<string, string> =
    activeTenantId === null ? {} : { "X-Tenant-Id": activeTenantId };
  return apiGet<CurrentOrganization>("/api/v1/organizations/current", { headers });
}
