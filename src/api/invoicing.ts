import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the INVOICING module (Fase 6 · ADR-006/016).
 * CFDI 4.0 documents from completed sales. Money is a NUMERIC string end to
 * end (never floats on the wire); the folio fiscal comes from the Mock PAC
 * of this phase. Every call carries the ACTIVE tenant header (the backend
 * re-verifies membership inside RLS on each request).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

export type CatalogName =
  | "REGIMEN"
  | "USO_CFDI"
  | "FORMA_PAGO"
  | "METODO_PAGO"
  | "MOTIVO_CANCELACION"
  | "UNIDAD"
  | "PRODUCTO_SERVICIO";

export interface CatalogItem {
  readonly code: string;
  readonly description: string;
}

export function listCatalog(catalog: CatalogName): Promise<readonly CatalogItem[]> {
  return apiGet<readonly CatalogItem[]>(
    `/api/v1/invoices/sat/catalogs?catalog=${catalog}`,
    { headers: tenantHeaders() },
  );
}

export interface EmisorView {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly rfc: string | null;
  readonly fiscalRegime: string | null;
  readonly zipCode: string | null;
  readonly complete: boolean;
}

export function listEmisores(): Promise<readonly EmisorView[]> {
  return apiGet<readonly EmisorView[]>("/api/v1/invoices/emisor", {
    headers: tenantHeaders(),
  });
}

export function saveEmisor(params: {
  readonly legalEntityId: string;
  readonly taxId: string;
  readonly fiscalRegime: string;
  readonly zipCode: string;
}): Promise<EmisorView> {
  return apiJson<EmisorView>(`/api/v1/invoices/emisor/${params.legalEntityId}`, {
    method: "PUT",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      taxId: params.taxId,
      fiscalRegime: params.fiscalRegime,
      zipCode: params.zipCode,
    }),
  });
}

export interface InvoiceLineView {
  readonly id: string;
  readonly saleLineId: string | null;
  readonly description: string;
  readonly sku: string | null;
  readonly unitSat: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly lineTotal: string;
  readonly taxRateCode: string | null;
  readonly taxTotal: string;
  readonly iepsRateCode: string | null;
  readonly iepsTotal: string;
}

/** One document-level federal retention (v0.11 · ADR-021). */
export interface WithholdingView {
  readonly code: string;
  readonly scheme: string;
  readonly rate: string;
  readonly amount: string;
}

export interface InvoiceView {
  readonly id: string;
  readonly serie: string;
  readonly folio: number;
  readonly folioLabel: string;
  readonly kind: "INDIVIDUAL" | "GLOBAL" | "CREDIT_NOTE" | "PAYMENT";
  readonly saleId: string | null;
  /** CREDIT_NOTE (v0.9 · ADR-019): the return the note reverses. */
  readonly returnId: string | null;
  /** CREDIT_NOTE: the related income CFDI. PAYMENT (v0.11 · ADR-021): the settled CFDI. */
  readonly relatedInvoiceId: string | null;
  readonly periodYear: number | null;
  readonly periodMonth: number | null;
  readonly receptorRfc: string;
  readonly receptorName: string;
  readonly receptorRegime: string;
  readonly receptorUse: string;
  readonly receptorZip: string;
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly status: "PENDING" | "STAMPED" | "CANCELED" | "ERROR";
  readonly statusReason: string | null;
  readonly fiscalId: string | null;
  readonly provider: string;
  readonly stampedAt: string | null;
  readonly cancelMotive: string | null;
  readonly cancelNote: string | null;
  readonly createdAt: string;
  readonly withholdings: readonly WithholdingView[];
  readonly withholdingTotal: string;
  /** PAYMENT (v0.11 · ADR-021): the settled amount / SAT forma de pago. */
  readonly paymentAmount: string | null;
  readonly paymentMethod: string | null;
  readonly paymentDate: string | null;
  /** Outstanding balance of an income CFDI (total minus stamped payments). */
  readonly outstanding: string | null;
  readonly lines: readonly InvoiceLineView[];
}

export function listInvoices(): Promise<readonly InvoiceView[]> {
  return apiGet<readonly InvoiceView[]>("/api/v1/invoices", {
    headers: tenantHeaders(),
  });
}

export interface ReceptorCommand {
  readonly rfc: string;
  readonly name: string;
  readonly regime: string;
  readonly use: string;
  readonly zip: string;
}

/** Issue a CFDI for ONE completed sale (no idempotency: partial unique index guards it). */
export function issueInvoice(params: {
  readonly saleId: string;
  readonly legalEntityId?: string | undefined;
  readonly receptor: ReceptorCommand;
  /** Federal retenciones (v0.11 · ADR-021), e.g. ["RETISR125", "RETIVA23"]. */
  readonly withholdings?: readonly string[] | undefined;
}): Promise<InvoiceView> {
  return apiJson<InvoiceView>("/api/v1/invoices", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      saleId: params.saleId,
      ...(params.legalEntityId !== undefined ? { legalEntityId: params.legalEntityId } : {}),
      receptor: params.receptor,
      ...(params.withholdings !== undefined && params.withholdings.length > 0
        ? { withholdings: params.withholdings }
        : {}),
    }),
  });
}

/** Issue the monthly GLOBAL invoice (receptor RFC genérico XAXX010101000). */
export function issueGlobalInvoice(params: {
  readonly periodYear: number;
  readonly periodMonth: number;
  readonly legalEntityId?: string | undefined;
}): Promise<InvoiceView> {
  return apiJson<InvoiceView>("/api/v1/invoices/global", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      periodYear: params.periodYear,
      periodMonth: String(params.periodMonth),
      ...(params.legalEntityId !== undefined ? { legalEntityId: params.legalEntityId } : {}),
    }),
  });
}

/** Cancel a STAMPED invoice with a SAT motive (01/02/03; 04 never applies to sales). */
export function cancelInvoice(params: {
  readonly invoiceId: string;
  readonly motive: string;
  readonly note: string;
}): Promise<InvoiceView> {
  return apiJson<InvoiceView>(`/api/v1/invoices/${params.invoiceId}/cancel`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ motive: params.motive, note: params.note }),
  });
}

/**
 * Issue the CREDIT_NOTE (CFDI tipo E) of ONE return (v0.9 · ADR-019).
 * The sale's FA must be STAMPED; the partial unique index guards duplicates
 * (a retry answers 409 with the folio of the existing NC).
 */
export function issueCreditNote(params: { readonly returnId: string }): Promise<InvoiceView> {
  return apiJson<InvoiceView>("/api/v1/invoices/credit-notes", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ returnId: params.returnId }),
  });
}

/**
 * Issue the PAYMENT complement (CFDI tipo P) of ONE STAMPED income CFDI
 * (v0.11 · ADR-021). The balance is the guard: an amount above it answers
 * 409 PAG_OVER_BALANCE.
 */
export function issuePaymentComplement(params: {
  readonly invoiceId: string;
  readonly amount: string;
  readonly method: string;
  readonly paymentDate?: string | undefined;
}): Promise<InvoiceView> {
  return apiJson<InvoiceView>(`/api/v1/invoices/${params.invoiceId}/payments`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      amount: params.amount,
      method: params.method,
      ...(params.paymentDate !== undefined ? { paymentDate: params.paymentDate } : {}),
    }),
  });
}
