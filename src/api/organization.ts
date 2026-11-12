import { apiGet, apiJson } from "./client";
import { getActiveTenantId, type CurrentOrganization } from "./auth";

/**
 * Business API surface of the ORGANIZATION module (Fase 2 · bloque B):
 * vertical profile, legal entities and effective branding. Every call
 * carries the ACTIVE tenant header (a routing hint — the backend re-verifies
 * membership inside RLS on each request).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

// ---- Vertical profile (ADR-010) ----

export interface VerticalProfileView {
  readonly code: string;
  readonly displayName: string;
  readonly baseUnit: string;
  readonly allowedUnits: readonly string[];
  readonly trackedDimensions: readonly string[];
  readonly negativeStockPolicy: string;
  readonly productAttributes: readonly {
    readonly code: string;
    readonly displayName: string;
    readonly required: boolean;
  }[];
}

export function verticalProfile(): Promise<VerticalProfileView> {
  return apiGet<VerticalProfileView>("/api/v1/organizations/current/profile", {
    headers: tenantHeaders(),
  });
}

export function changeVertical(verticalCode: string): Promise<VerticalProfileView> {
  return apiJson<VerticalProfileView>("/api/v1/organizations/current/vertical", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ verticalCode }),
  });
}

export function verticalCatalog(): Promise<{ readonly verticals: readonly VerticalProfileView[] }> {
  return apiGet<{ verticals: readonly VerticalProfileView[] }>("/api/v1/verticals");
}

// ---- Legal entities (ADR-009) ----

export interface LegalEntityView {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
}

export function legalEntities(): Promise<readonly LegalEntityView[]> {
  return apiGet<readonly LegalEntityView[]>("/api/v1/organizations/current/legal-entities", {
    headers: tenantHeaders(),
  });
}

export interface AddLegalEntityCommand {
  readonly legalName: string;
  readonly tradeName?: string;
  readonly taxId?: string;
  readonly branchName?: string;
  readonly branchCity?: string;
}

export function addLegalEntity(command: AddLegalEntityCommand): Promise<{
  readonly organizationId: string;
  readonly legalEntityId: string;
  readonly branchId: string | null;
}> {
  return apiJson("/api/v1/organizations/current/legal-entities", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

// ---- Effective branding (ADR-007) ----

export interface EffectiveBrandingView {
  readonly name: string | null;
  readonly logoUrl: string | null;
  readonly domain: string | null;
  readonly colors: Readonly<Record<string, string>>;
  readonly templates: Readonly<Record<string, string>>;
  readonly featureFlags: Readonly<Record<string, unknown>>;
  readonly source: string;
}

export function effectiveBranding(): Promise<EffectiveBrandingView> {
  return apiGet<EffectiveBrandingView>("/api/v1/branding/effective", { headers: tenantHeaders() });
}

// ---- Self-service onboarding (ADR-012) ----

export interface OnboardOrganizationCommand {
  readonly organizationName: string;
  readonly legalName: string;
  readonly tradeName?: string;
  readonly taxId?: string;
  readonly branchName: string;
  readonly branchCity?: string;
}

export interface OnboardOrganizationView {
  readonly organizationId: string;
  readonly legalEntityId: string;
  readonly branchId: string;
  readonly ownerId: string;
}

export function onboardOrganization(command: OnboardOrganizationCommand): Promise<OnboardOrganizationView> {
  return apiJson<OnboardOrganizationView>("/api/v1/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
}

export function currentOrganization(): Promise<CurrentOrganization> {
  return apiGet<CurrentOrganization>("/api/v1/organizations/current", {
    headers: tenantHeaders(),
  });
}
