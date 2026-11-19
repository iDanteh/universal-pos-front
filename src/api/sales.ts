import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the SALES module (Fase 4 · sales-payments.md).
 * Money is a string end to end (NUMERIC in the DB — never float). Every call
 * carries the ACTIVE tenant header (a routing hint — the backend re-verifies
 * membership inside RLS on each request).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

export interface SaleLineView {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly sku: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly lineTotal: string;
  /** Snapshot rate code of the line (v0.8 · ADR-018); null = sin impuesto. */
  readonly taxRateCode: string | null;
  readonly iepsRateCode: string | null;
  readonly taxTotal: string;
  readonly iepsTotal: string;
}

export interface SalePaymentView {
  readonly id: string;
  readonly method: string;
  readonly amount: string;
  readonly reference: string | null;
}

export interface SaleView {
  readonly id: string;
  readonly folio: number;
  readonly status: "COMPLETED" | "CANCELED";
  readonly statusReason: string | null;
  readonly note: string | null;
  readonly currency: string;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly idempotencyKey: string;
  /** Shift the sale was attached to (ADR-017); null when no drawer was open. */
  readonly cashSessionId: string | null;
  readonly createdAt: string;
  readonly lines: readonly SaleLineView[];
  readonly payments: readonly SalePaymentView[];
}

export function listSales(): Promise<readonly SaleView[]> {
  return apiGet<readonly SaleView[]>("/api/v1/sales", { headers: tenantHeaders() });
}

export function getSale(saleId: string): Promise<SaleView> {
  return apiGet<SaleView>(`/api/v1/sales/${saleId}`, { headers: tenantHeaders() });
}

export interface SaleLineCommand {
  readonly variantId: string;
  readonly quantity: string;
  readonly unitPrice?: string;
}

export interface SalePaymentCommand {
  readonly method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  readonly amount: string;
  readonly reference?: string;
}

export interface CreateSaleCommand {
  readonly lines: readonly SaleLineCommand[];
  readonly payments: readonly SalePaymentCommand[];
  readonly note?: string;
  /** Optional explicit stock warehouse (required when the tenant has >= 2 active). */
  readonly warehouseId?: string;
}

/** The caller MUST provide a fresh idempotency key (retries keep the same key). */
export function createSale(idempotencyKey: string, command: CreateSaleCommand): Promise<SaleView> {
  return apiJson<SaleView>("/api/v1/sales", {
    method: "POST",
    headers: tenantHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    }),
    body: JSON.stringify(command),
  });
}

export function cancelSale(saleId: string, reason: string): Promise<SaleView> {
  return apiJson<SaleView>(`/api/v1/sales/${saleId}/cancel`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reason }),
  });
}

// ---- Returns (Fase 9 · ADR-019) ----

export interface ReturnLineView {
  readonly id: string;
  readonly saleLineId: string;
  readonly variantId: string;
  readonly productName: string;
  readonly sku: string;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly lineTotal: string;
  readonly taxRateCode: string | null;
  readonly iepsRateCode: string | null;
  readonly taxTotal: string;
  readonly iepsTotal: string;
}

export interface ReturnView {
  readonly id: string;
  readonly folio: number;
  readonly folioLabel: string;
  readonly saleId: string;
  readonly saleFolio: number;
  readonly status: "COMPLETED";
  readonly note: string | null;
  readonly currency: string;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly refundMethod: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  readonly refundAmount: string;
  readonly refundReference: string | null;
  /** Shift the refund was attached to (ADR-017); null when no drawer was open. */
  readonly cashSessionId: string | null;
  /** Folio of the STAMPED credit note covering this return, if any. */
  readonly creditNoteLabel: string | null;
  /** True when the sale has a stamped FA and this return has no active NC yet. */
  readonly creditNoteIssuable: boolean;
  readonly createdAt: string;
  readonly lines: readonly ReturnLineView[];
}

export function listReturns(): Promise<readonly ReturnView[]> {
  return apiGet<readonly ReturnView[]>("/api/v1/returns", {
    headers: tenantHeaders(),
  });
}

export function listReturnsBySale(saleId: string): Promise<readonly ReturnView[]> {
  return apiGet<readonly ReturnView[]>(`/api/v1/returns/${saleId}`, {
    headers: tenantHeaders(),
  });
}

export interface ReturnLineCommand {
  readonly saleLineId: string;
  readonly quantity: string;
}

export interface CreateReturnCommand {
  readonly lines: readonly ReturnLineCommand[];
  readonly refundMethod: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  readonly refundReference?: string;
  readonly note?: string;
}

/** Create a return of a COMPLETED sale; the SAME key replays the SAME return. */
export function createReturn(
  saleId: string,
  idempotencyKey: string,
  command: CreateReturnCommand,
): Promise<ReturnView> {
  return apiJson<ReturnView>(`/api/v1/returns/${saleId}`, {
    method: "POST",
    headers: tenantHeaders({
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    }),
    body: JSON.stringify(command),
  });
}
