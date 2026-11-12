import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the CASH module (Fase 7 · ADR-017): the drawer
 * (caja) lifecycle. Money is a string end to end (NUMERIC in the DB — never
 * float). Every call carries the ACTIVE tenant header (a routing hint — the
 * backend re-verifies membership inside RLS on each request).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

export interface CashSessionView {
  readonly id: string;
  readonly status: "OPEN" | "CLOSED";
  readonly openingFloat: string;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly countedCash: string | null;
  readonly countedCard: string | null;
  readonly countedTransfer: string | null;
  readonly countedOther: string | null;
  /** Reconciliation resolved by the backend (CLOSED sessions only). */
  readonly expectedCash: string | null;
  readonly difference: string | null;
  readonly closeNote: string | null;
  readonly salesCount: number;
  /** Live cash of the shift (Σ CASH payments of the attached sales). */
  readonly cashTotal: string;
  /** Returns attached to the shift (v0.9 · ADR-019). */
  readonly refundsCount: number;
  /** Live CASH refunds the drawer paid back (Σ CASH refund_amount). */
  readonly cashRefunds: string;
}

export function listCashSessions(): Promise<readonly CashSessionView[]> {
  return apiGet<readonly CashSessionView[]>("/api/v1/cash/sessions", {
    headers: tenantHeaders(),
  });
}

export function getCashSession(sessionId: string): Promise<CashSessionView> {
  return apiGet<CashSessionView>(`/api/v1/cash/sessions/${sessionId}`, {
    headers: tenantHeaders(),
  });
}

export function openCashSession(openingFloat: string): Promise<CashSessionView> {
  return apiJson<CashSessionView>("/api/v1/cash/sessions", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ openingFloat }),
  });
}

export interface CloseSessionCommand {
  readonly countedCash: string;
  readonly countedCard?: string;
  readonly countedTransfer?: string;
  readonly countedOther?: string;
  readonly note?: string;
}

export function closeCashSession(
  sessionId: string,
  command: CloseSessionCommand,
): Promise<CashSessionView> {
  return apiJson<CashSessionView>(`/api/v1/cash/sessions/${sessionId}/close`, {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(command),
  });
}
