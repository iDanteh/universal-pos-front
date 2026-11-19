import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the CATALOG module (Fase 3 · ADR-004 + ADR-010):
 * products, sellable variants and the vertical's declarative units/attributes.
 * Every call carries the ACTIVE tenant header (a routing hint — the backend
 * re-verifies membership inside RLS on each request). Price is a string:
 * NUMERIC(14,4) end to end, never a float.
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

// ---- Declarative parameterization (units + attributes per giro) ----

export interface CatalogUnits {
  readonly verticalCode: string;
  readonly verticalName: string;
  readonly baseUnit: string;
  readonly allowedUnits: readonly string[];
  readonly productAttributes: readonly {
    readonly code: string;
    readonly displayName: string;
    readonly required: boolean;
  }[];
  /** Tracking dimensions the vertical forces (LOT / EXPIRY / SERIAL). */
  readonly trackedDimensions: readonly string[];
}

export function catalogUnits(): Promise<CatalogUnits> {
  return apiGet<CatalogUnits>("/api/v1/catalog/units", { headers: tenantHeaders() });
}

// ---- Products / variants ----

export interface VariantView {
  readonly id: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly unit: string;
  readonly attributes: Readonly<Record<string, string>> | null;
  readonly price: string | null;
  /** Applied rate code (v0.8 · ADR-018); null/"" = sin impuesto. */
  readonly taxRateCode: string | null;
  /** OPTIONAL IEPS slot (v0.11 · ADR-021); null/"" = sin IEPS. */
  readonly iepsRateCode: string | null;
  readonly status: string;
}

export interface ProductView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly baseUnit: string;
  readonly status: string;
  readonly variants: readonly VariantView[];
}

export function catalogProducts(): Promise<readonly ProductView[]> {
  return apiGet<readonly ProductView[]>("/api/v1/catalog/products", { headers: tenantHeaders() });
}

export interface VariantItemCommand {
  readonly sku: string;
  readonly barcode?: string;
  readonly unit: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly price?: string;
  /** "" (or omitted) = sin impuesto. Validated against the global catalog. */
  readonly taxRateCode?: string;
  /** "" (or omitted) = sin IEPS (v0.11 · ADR-021). */
  readonly iepsRateCode?: string;
}

export interface CreateProductCommand {
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly baseUnit: string;
  readonly variants?: readonly VariantItemCommand[];
}

export function createProduct(command: CreateProductCommand): Promise<ProductView> {
  return apiJson<ProductView>("/api/v1/catalog/products", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

export interface AddVariantCommand {
  readonly sku: string;
  readonly barcode?: string;
  readonly unit: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly price?: string;
  /** "" (or omitted) = sin impuesto. Validated against the global catalog. */
  readonly taxRateCode?: string;
  /** "" (or omitted) = sin IEPS (v0.11 · ADR-021). */
  readonly iepsRateCode?: string;
}

export function addVariant(productId: string, command: AddVariantCommand): Promise<VariantView> {
  return apiJson<VariantView>(`/api/v1/catalog/products/${productId}/variants`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}

// ---- Tax rates (v0.8 · ADR-018: global catalog, the variant form dropdown) ----

export interface TaxRateView {
  readonly code: string;
  readonly scheme: "IVA" | "IEPS";
  readonly factor: "TASA" | "EXENTO";
  /** "0.1600"-style string (NUMERIC(8,4) end to end — never a float). */
  readonly rate: string;
  readonly description: string;
}

export function catalogTaxes(): Promise<readonly TaxRateView[]> {
  return apiGet<readonly TaxRateView[]>("/api/v1/catalog/taxes", { headers: tenantHeaders() });
}

export interface WithholdingRateView {
  readonly code: string;
  readonly scheme: "ISR" | "IVA";
  /** "0.100000"-style FRACTION (NUMERIC(10,6) end to end — never a float). */
  readonly rate: string;
  readonly description: string;
}

/** Federal retenciones (v0.11 · ADR-021): the invoice form's dropdown. */
export function catalogWithholdings(): Promise<readonly WithholdingRateView[]> {
  return apiGet<readonly WithholdingRateView[]>("/api/v1/catalog/withholdings", {
    headers: tenantHeaders(),
  });
}
