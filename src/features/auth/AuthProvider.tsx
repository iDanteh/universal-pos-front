import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  currentOrganization,
  getActiveTenantId,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  setActiveTenant,
  type AuthenticatedUser,
  type CurrentOrganization,
  type OrganizationRef,
} from "@/api/auth";
import { apiGet, ApiError } from "@/api/client";

/**
 * Session state for the admin app. The cookie is HttpOnly (never touched
 * from JS): on mount we simply ASK the backend who we are. Tenant
 * selection lives here too — the id travels as a routing hint header and
 * the BACKEND verifies membership inside RLS on every request.
 * v0.10 (ADR-020): the effective permission codes of the ACTIVE tenant ride
 * along (GET /auth/permissions) — the UI hides what the member cannot do;
 * the PermissionGuard stays the law server-side.
 */
export interface AuthState {
  /** "loading" until the first /me round-trip resolves. */
  readonly status: "loading" | "anon" | "authed";
  readonly user: AuthenticatedUser | null;
  readonly organizations: readonly OrganizationRef[];
  /** Live name of the ACTIVE tenant (from /organizations/current). */
  readonly organizationName: string | null;
  readonly activeTenantId: string | null;
  /** Effective permission codes for the ACTIVE tenant (UI gating only). */
  readonly permissions: readonly string[];
  /** True when the ACTIVE tenant grants ANY of the given codes. */
  can: (...codes: readonly string[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (organizationId: string) => Promise<void>;
  /** Re-fetches /me + tenant binding (e.g. after onboarding a new org). */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function pickTenantId(refs: readonly OrganizationRef[], previous: string | null): string | null {
  if (previous !== null && refs.some((r) => r.organizationId === previous)) {
    return previous;
  }
  const primary = refs.find((r) => r.primary) ?? refs.at(0);
  return primary?.organizationId ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [organizations, setOrganizations] = useState<readonly OrganizationRef[]>([]);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<readonly string[]>([]);

  const can = useCallback(
    (...codes: readonly string[]) => codes.some((code) => permissions.includes(code)),
    [permissions],
  );

  /** Re-resolves the ACTIVE tenant + its effective permission codes. */
  const refreshTenant = useCallback(async (refs: readonly OrganizationRef[], previous: string | null) => {
    const tenantId = pickTenantId(refs, previous);
    setActiveTenant(tenantId);
    setPermissions([]);
    if (tenantId === null) {
      setOrganizationName(null);
      return;
    }
    try {
      const org: CurrentOrganization = await currentOrganization();
      setOrganizationName(org.name);
    } catch {
      // Fail-open for the NAME only: the request is still tenant-verified
      // server-side on every call; navigation continues.
      setOrganizationName(null);
    }
    try {
      const granted = await apiGet<readonly string[]>("/api/v1/auth/permissions", {
        headers: { "X-Tenant-Id": tenantId },
      });
      setPermissions(granted);
    } catch {
      // UI gating only: an empty set hides management actions; the
      // server-side PermissionGuard remains the law.
      setPermissions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outcome = await apiMe();
        if (cancelled) return;
        setUser(outcome.user);
        setOrganizations(outcome.organizations);
        setStatus("authed");
        await refreshTenant(outcome.organizations, getActiveTenantId());
      } catch (error) {
        if (cancelled) return;
        const isAnon = error instanceof ApiError && error.status === 401;
        setStatus(isAnon ? "anon" : "anon");
        setUser(null);
        setOrganizations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTenant]);

  const login = useCallback(
    async (email: string, password: string) => {
      await apiLogin(email, password);
      const outcome = await apiMe();
      setUser(outcome.user);
      setOrganizations(outcome.organizations);
      setStatus("authed");
      await refreshTenant(outcome.organizations, null);
    },
    [refreshTenant],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setOrganizations([]);
      setActiveTenant(null);
      setOrganizationName(null);
      setPermissions([]);
      setStatus("anon");
    }
  }, []);

  const switchTenant = useCallback(async (organizationId: string) => {
    setActiveTenant(organizationId);
    setPermissions([]);
    try {
      const org = await currentOrganization();
      setOrganizationName(org.name);
    } catch {
      setOrganizationName(null);
    }
    try {
      const granted = await apiGet<readonly string[]>("/api/v1/auth/permissions", {
        headers: { "X-Tenant-Id": organizationId },
      });
      setPermissions(granted);
    } catch {
      setPermissions([]);
    }
  }, []);

  const reload = useCallback(async () => {
    const outcome = await apiMe();
    setUser(outcome.user);
    setOrganizations(outcome.organizations);
    setStatus("authed");
    await refreshTenant(outcome.organizations, getActiveTenantId());
  }, [refreshTenant]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      organizations,
      organizationName,
      activeTenantId: getActiveTenantId(),
      permissions,
      can,
      login,
      logout,
      switchTenant,
      reload,
    }),
    [status, user, organizations, organizationName, permissions, can, login, logout, switchTenant, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (state === null) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return state;
}
