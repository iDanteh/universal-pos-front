import { apiGet, apiJson } from "./client";
import { getActiveTenantId } from "./auth";

/**
 * Business API surface of the INVENTORY module (Fase 5 · ADR-004).
 * Quantities are NUMERIC strings end to end (never floats on the wire).
 * Every call carries the ACTIVE tenant header (the backend re-verifies
 * membership inside RLS on each request).
 */
function tenantHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> =
    getActiveTenantId() === null ? {} : { "X-Tenant-Id": getActiveTenantId() as string };
  return { ...headers, ...extra };
}

export interface WarehouseView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly createdAt: string;
}

export function listWarehouses(): Promise<readonly WarehouseView[]> {
  return apiGet<readonly WarehouseView[]>("/api/v1/inventory/warehouses", {
    headers: tenantHeaders(),
  });
}

export function createWarehouse(code: string, name: string): Promise<WarehouseView> {
  return apiJson<WarehouseView>("/api/v1/inventory/warehouses", {
    method: "POST",
    headers: tenantHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ code, name }),
  });
}

export interface LotView {
  readonly lotCode: string;
  readonly expiryDate: string | null;
  readonly quantity: string;
}

export interface BalanceView {
  readonly variantId: string;
  readonly sku: string;
  readonly productName: string;
  readonly unit: string;
  readonly quantity: string;
  readonly lots: readonly LotView[];
}

export function listBalances(warehouseId: string): Promise<readonly BalanceView[]> {
  return apiGet<readonly BalanceView[]>(
    `/api/v1/inventory/balances?warehouseId=${warehouseId}`,
    { headers: tenantHeaders() },
  );
}

export interface MovementView {
  readonly id: string;
  readonly warehouseId: string;
  readonly warehouseCode: string;
  readonly direction: "IN" | "OUT";
  readonly cause: string;
  readonly variantId: string;
  readonly sku: string | null;
  readonly quantity: string;
  readonly lotCode: string | null;
  readonly expiryDate: string | null;
  readonly reference: string | null;
  readonly note: string | null;
  readonly relatedMovementId: string | null;
  readonly createdAt: string;
}

export function listMovements(params?: {
  readonly warehouseId?: string;
  readonly variantId?: string;
}): Promise<readonly MovementView[]> {
  const query = new URLSearchParams();
  if (params?.warehouseId) query.set("warehouseId", params.warehouseId);
  if (params?.variantId) query.set("variantId", params.variantId);
  const suffix = query.toString() === "" ? "" : `?${query.toString()}`;
  return apiGet<readonly MovementView[]>(`/api/v1/inventory/movements${suffix}`, {
    headers: tenantHeaders(),
  });
}

export interface StockLineCommand {
  readonly variantId: string;
  readonly quantity: string;
  readonly lotCode?: string;
  readonly expiryDate?: string;
}

/** Receive stock (IN movements, cause PURCHASE). */
export function receiveStock(command: {
  readonly warehouseId: string;
  readonly lines: readonly StockLineCommand[];
  readonly reference?: string;
  readonly note?: string;
}): Promise<{ readonly movements: readonly MovementView[]; readonly alert: string | null }> {
  return apiJson<{ readonly movements: readonly MovementView[]; readonly alert: string | null }>(
    "/api/v1/inventory/receipts",
    {
      method: "POST",
      headers: tenantHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(command),
    },
  );
}

export interface AdjustLineCommand {
  readonly variantId: string;
  readonly direction: "IN" | "OUT";
  readonly quantity: string;
  readonly lotCode?: string;
  readonly expiryDate?: string;
}

/** Manual correction (new ADJUST movement — history is never edited). */
export function adjustStock(command: {
  readonly warehouseId: string;
  readonly lines: readonly AdjustLineCommand[];
  readonly reason: string;
  readonly note?: string;
}): Promise<{ readonly movements: readonly MovementView[]; readonly alert: string | null }> {
  return apiJson<{ readonly movements: readonly MovementView[]; readonly alert: string | null }>(
    "/api/v1/inventory/adjustments",
    {
      method: "POST",
      headers: tenantHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(command),
    },
  );
}

export interface TransferLineCommand {
  readonly variantId: string;
  readonly quantity: string;
}

/** Mirror-pair transfer (TRANSFER_OUT + TRANSFER_IN linked). */
export function transferStock(command: {
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly lines: readonly TransferLineCommand[];
  readonly note?: string;
}): Promise<{ readonly movements: readonly MovementView[]; readonly alert: string | null }> {
  return apiJson<{ readonly movements: readonly MovementView[]; readonly alert: string | null }>(
    "/api/v1/inventory/transfers",
    {
      method: "POST",
      headers: tenantHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(command),
    },
  );
}
