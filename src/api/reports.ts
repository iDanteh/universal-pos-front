import { apiGet } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * READ-ONLY reports API (Fase 13 · ADR-023). Money is a STRING end to end
 * (NUMERIC in PostgreSQL — never float). The range is inclusive in the
 * tenant's business time zone (America/Mexico_City by default); the backend
 * converts it to half-open instants. A Z corte is scoped to ONE drawer id,
 * not to a date window.
 */
function tenantHeaders(): Record<string, string> {
  const tenant = getActiveTenantId();
  return tenant === null ? {} : { "X-Tenant-Id": tenant };
}

export interface ReportRange {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
}

export interface DayRow {
  readonly date: string;
  readonly salesCount: number;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly refunds: string;
}

export interface MethodRow {
  readonly method: string;
  readonly count: number;
  readonly amount: string;
}

export interface ProductRow {
  readonly productName: string;
  readonly sku: string;
  readonly quantity: string;
  readonly amount: string;
}

export interface SalesReport {
  readonly range: ReportRange;
  readonly currency: string;
  readonly salesCount: number;
  readonly canceledCount: number;
  readonly refundsCount: number;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly iepsTotal: string;
  readonly ivaTotal: string;
  readonly withheldTotal: string;
  readonly grossSales: string;
  readonly refundsTotal: string;
  readonly netSales: string;
  readonly averageTicket: string;
  readonly byDay: readonly DayRow[];
  readonly byPaymentMethod: readonly MethodRow[];
  readonly topProducts: readonly ProductRow[];
}

export interface TaxRow {
  readonly code: string;
  readonly scheme: string;
  readonly rate: string | null;
  readonly base: string | null;
  readonly amount: string;
}

export interface TaxesReport {
  readonly range: ReportRange;
  readonly currency: string;
  readonly transferred: readonly TaxRow[];
  readonly withheld: readonly TaxRow[];
  readonly transferredTotal: string;
  readonly withheldTotal: string;
}

export interface ZSaleRow {
  readonly folio: number;
  readonly total: string;
  readonly status: "COMPLETED" | "CANCELED";
  readonly createdAt: string;
  readonly paymentMethods: string | null;
}

export interface ZReport {
  readonly range: { readonly from: string; readonly to: string | null; readonly timeZone: string };
  readonly currency: string;
  readonly sessionId: string;
  readonly status: "OPEN" | "CLOSED";
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly openingFloat: string;
  readonly salesCount: number;
  readonly canceledCount: number;
  readonly refundsCount: number;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly iepsTotal: string;
  readonly ivaTotal: string;
  readonly withheldTotal: string;
  readonly grossSales: string;
  readonly refundsTotal: string;
  readonly netSales: string;
  readonly cashSales: string;
  readonly cashRefunds: string;
  readonly expectedCash: string;
  readonly countedCash: string | null;
  readonly difference: string | null;
  readonly closeNote: string | null;
  readonly byPaymentMethod: readonly MethodRow[];
  readonly sales: readonly ZSaleRow[];
}

function rangeQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from !== "") params.set("from", from);
  if (to !== "") params.set("to", to);
  const qs = params.toString();
  return qs === "" ? "" : `?${qs}`;
}

export function getSalesReport(from: string, to: string): Promise<SalesReport> {
  return apiGet<SalesReport>(`/api/v1/reports/sales${rangeQuery(from, to)}`, {
    headers: tenantHeaders(),
  });
}

export function getTaxesReport(from: string, to: string): Promise<TaxesReport> {
  return apiGet<TaxesReport>(`/api/v1/reports/taxes${rangeQuery(from, to)}`, {
    headers: tenantHeaders(),
  });
}

export function getZReport(cashSessionId: string): Promise<ZReport> {
  return apiGet<ZReport>(`/api/v1/reports/z/${cashSessionId}`, {
    headers: tenantHeaders(),
  });
}
