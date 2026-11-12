import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import { catalogUnits, type CatalogUnits } from "@/api/catalog";
import {
  adjustStock,
  createWarehouse,
  listBalances,
  listMovements,
  listWarehouses,
  receiveStock,
  transferStock,
  type BalanceView,
  type MovementView,
  type WarehouseView,
} from "@/api/inventory";

/** Display-only quantity formatting of backend NUMERIC strings (never floats). */
function qty(value: string): string {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return amount.toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

function when(value: string): string {
  return new Date(value).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const CAUSE_LABEL: Readonly<Record<string, string>> = {
  PURCHASE: "Compra",
  ADJUST: "Ajuste",
  SALE: "Venta",
  SALE_RETURN: "Devolución de venta",
  TRANSFER_IN: "Traspaso entrante",
  TRANSFER_OUT: "Traspaso saliente",
};

/**
 * INVENTARIO page (fase 5 · ADR-004): warehouses, aggregate balances with
 * their FEFO lots, stock operations (recepción / ajuste / traspaso) and the
 * immutable movement history. The backend owns every rule (lot requirements
 * per vertical, negative-stock policy, mirror transfers) and re-validates it.
 */
export function InventoryPage() {
  const { activeTenantId } = useAuth();
  const unitsRes = useApiResource<CatalogUnits>(catalogUnits);
  const warehousesRes = useApiResource<readonly WarehouseView[]>(listWarehouses);
  const movementsRes = useApiResource<readonly MovementView[]>(() => listMovements());

  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    warehousesRes.reload();
    movementsRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const warehouses = warehousesRes.data ?? [];

  const [selectedId, setSelectedId] = useState<string>("");

  // Auto-pick the first warehouse once the list loads (tenant-scoped by remount).
  useEffect(() => {
    if (selectedId === "" && warehouses.length > 0) {
      const first = warehouses[0];
      if (first !== undefined) setSelectedId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehousesRes.data]);

  // No warehouse selected -> an already-settled empty list (no wasted request).
  const balancesRes = useApiResource<readonly BalanceView[]>(() =>
    selectedId === "" ? Promise.resolve<readonly BalanceView[]>([]) : listBalances(selectedId),
  );

  // Reload balances when the warehouse OR the tenant changes.
  const balancesKey = `${activeTenantId}:${selectedId}`;
  const balancesFirstRun = useRef(true);
  useEffect(() => {
    if (balancesFirstRun.current) {
      balancesFirstRun.current = false;
      return;
    }
    balancesRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balancesKey]);

  const onStockChanged = () => {
    balancesRes.reload();
    movementsRes.reload();
  };

  return (
    <section aria-labelledby="inventory-title">
      <div className="page-header">
        <h1 id="inventory-title">Inventario</h1>
        <p>
          Almacenes, existencias con lotes y un historial de movimientos
          inmutable: toda corrección es un movimiento nuevo, nunca una edición.
        </p>
      </div>

      {warehousesRes.error !== null ? (
        <ErrorNotice error={warehousesRes.error} onRetry={warehousesRes.reload} />
      ) : unitsRes.error !== null ? (
        <ErrorNotice error={unitsRes.error} onRetry={unitsRes.reload} />
      ) : null}

      <div className="org-grid">
        <div className="card card--pad">
          <WarehouseCard warehousesRes={warehousesRes} />
        </div>

        <div className="card card--pad org-grid__wide">
          <div className="card__title">Existencias</div>
          <div className="org-form-grid" style={{ marginBottom: "var(--space-3)" }}>
            <div className="field">
              <label className="field__label" htmlFor="inv-warehouse">Almacén</label>
              {warehouses.length === 0 ? (
                <p className="org-page__muted" style={{ margin: 0 }}>
                  Crea el primer almacén a la izquierda.
                </p>
              ) : (
                <select
                  id="inv-warehouse"
                  className="input"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}{w.active ? "" : " (inactivo)"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {selectedId === "" ? (
            <p className="org-page__muted">Selecciona un almacén para ver sus existencias.</p>
          ) : balancesRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando existencias…
            </span>
          ) : balancesRes.error !== null ? (
            <ErrorNotice error={balancesRes.error} onRetry={balancesRes.reload} />
          ) : (balancesRes.data ?? []).length === 0 ? (
            <p className="org-page__muted">Sin existencias aún: registra una recepción abajo.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {(balancesRes.data ?? []).map((balance) => (
                <InventoryRow key={balance.variantId} balance={balance} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="org-grid" style={{ marginTop: "var(--space-4)" }}>
        <div className="card card--pad org-grid__wide">
          <StockOperationsCard
            warehouses={warehouses}
            selectedId={selectedId}
            balances={balancesRes.data ?? []}
            units={unitsRes.data}
            onDone={onStockChanged}
          />
        </div>

        <div className="card card--pad">
          <div className="card__title">Movimientos recientes</div>
          {movementsRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando movimientos…
            </span>
          ) : movementsRes.error !== null ? (
            <ErrorNotice error={movementsRes.error} onRetry={movementsRes.reload} />
          ) : (movementsRes.data ?? []).length === 0 ? (
            <p className="org-page__muted">Sin movimientos todavía.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {(movementsRes.data ?? []).map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Warehouses ----

function WarehouseCard({
  warehousesRes,
}: {
  warehousesRes: ReturnType<typeof useApiResource<readonly WarehouseView[]>>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const warehouse = await createWarehouse(code, name);
      setSuccess(`Almacén ${warehouse.code} creado.`);
      setCode("");
      setName("");
      warehousesRes.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card__title">Almacenes</div>
      {(warehousesRes.data ?? []).length === 0 ? (
        <p className="org-page__muted">
          Sin almacenes aún: las ventas de esta organización no descuentan stock.
        </p>
      ) : (
        <div style={{ display: "grid", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          {(warehousesRes.data ?? []).map((warehouse) => (
            <div className="meta-list__row" key={warehouse.id}>
              <dt>
                <span className="org-page__code">{warehouse.code}</span> {warehouse.name}
              </dt>
              <dd>{warehouse.active ? "activo" : "inactivo"}</dd>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)" }}>
        <div className="field">
          <label className="field__label" htmlFor="wh-code">Código *</label>
          <input
            id="wh-code"
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ALM-01"
            maxLength={32}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="wh-name">Nombre *</label>
          <input
            id="wh-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Almacén principal"
            maxLength={120}
            required
          />
        </div>
        {error !== null ? (
          <p className="org-page__form-error" role="alert">{error.userMessage}</p>
        ) : null}
        {success !== null ? <p className="org-page__form-success">{success}</p> : null}
        <div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Creando…" : "Crear almacén"}
          </button>
        </div>
      </form>
    </>
  );
}

// ---- Balances ----

function InventoryRow({ balance }: { balance: BalanceView }) {
  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <strong>{balance.productName}</strong>
        <span className="org-page__code">{balance.sku}</span>
        <span style={{ fontWeight: 600 }}>{qty(balance.quantity)} {balance.unit}</span>
      </div>
      {balance.lots.length > 0 ? (
        <p className="org-page__muted" style={{ margin: 0 }}>
          {balance.lots
            .map((lot) =>
              lot.expiryDate === null
                ? `${lot.lotCode}: ${qty(lot.quantity)}`
                : `${lot.lotCode} (caduca ${lot.expiryDate}): ${qty(lot.quantity)}`,
            )
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

// ---- Stock operations ----

const OP_LABEL: Readonly<Record<StockOp, string>> = {
  receive: "Recepción (compra)",
  adjust: "Ajuste manual",
  transfer: "Traspaso entre almacenes",
};

type StockOp = "receive" | "adjust" | "transfer";

interface OpLine {
  readonly variantId: string;
  readonly label: string;
  readonly quantity: string;
  readonly lotCode: string;
  readonly expiryDate: string;
}

const EMPTY_LINE = (variantId: string, label: string): OpLine => ({
  variantId,
  label,
  quantity: "1",
  lotCode: "",
  expiryDate: "",
});

/**
 * Unified receive / adjust / transfer panel. Reception and adjust operate on
 * the warehouse selected in the Existencias card; transfers pick any two.
 * Lots/caducidad inputs appear ONLY when the tenant's vertical tracks them.
 */
function StockOperationsCard({
  warehouses,
  selectedId,
  balances,
  units,
  onDone,
}: {
  warehouses: readonly WarehouseView[];
  selectedId: string;
  balances: readonly BalanceView[];
  units: CatalogUnits | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<StockOp>("receive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lines, setLines] = useState<readonly OpLine[]>([]);
  const [reason, setReason] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const tracksLot = units?.trackedDimensions.includes("LOT") === true;
  const tracksExpiry = units?.trackedDimensions.includes("EXPIRY") === true;

  if (warehouses.length === 0) {
    return (
      <>
        <div className="card__title">Movimientos de stock</div>
        <p className="org-page__muted">Crea un almacén para registrar movimientos.</p>
      </>
    );
  }

  const pickable = balances.length > 0 ? balances : null;

  const addLine = () => {
    const pick = pickable?.[0];
    if (pick === undefined) return;
    setLines((prev) => [
      ...prev,
      EMPTY_LINE(pick.variantId, `${pick.productName} · ${pick.sku}`),
    ]);
  };

  const pickVariant = (variantId: string) => {
    const pick = pickable?.find((b) => b.variantId === variantId);
    if (pick === undefined) return;
    setLines((prev) => [
      ...prev,
      EMPTY_LINE(pick.variantId, `${pick.productName} · ${pick.sku}`),
    ]);
  };

  const reset = () => {
    setLines([]);
    setReason("");
    setSuccess(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (op === "receive") {
        await receiveStock({
          warehouseId: selectedId,
          lines: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            ...(tracksLot && line.lotCode !== "" ? { lotCode: line.lotCode } : {}),
            ...(tracksExpiry && line.expiryDate !== "" ? { expiryDate: line.expiryDate } : {}),
          })),
        });
        setSuccess("Recepción registrada: existencias actualizadas.");
      } else if (op === "adjust") {
        await adjustStock({
          warehouseId: selectedId,
          reason,
          lines: lines.map((line) => ({
            variantId: line.variantId,
            direction: "IN",
            quantity: line.quantity,
            ...(tracksLot && line.lotCode !== "" ? { lotCode: line.lotCode } : {}),
            ...(tracksExpiry && line.expiryDate !== "" ? { expiryDate: line.expiryDate } : {}),
          })),
        });
        setSuccess("Ajuste (entrada) registrado.");
      } else {
        await transferStock({
          fromWarehouseId: fromId,
          toWarehouseId: toId,
          lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
        });
        setSuccess("Traspaso registrado (par espejo OUT/IN).");
      }
      reset();
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const disableSubmit =
    busy ||
    lines.length === 0 ||
    (op === "adjust" && reason.trim() === "") ||
    (op === "transfer" && (fromId === "" || toId === "" || fromId === toId));

  return (
    <>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <div className="card__title" style={{ marginRight: "var(--space-2)" }}>Movimientos de stock</div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Nuevo movimiento"}
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
          <div className="org-form-grid">
            <div className="field">
              <label className="field__label" htmlFor="stock-op">Tipo</label>
              <select
                id="stock-op"
                className="input"
                value={op}
                onChange={(e) => {
                  setOp(e.target.value as StockOp);
                  setLines([]);
                  setSuccess(null);
                  setError(null);
                }}
              >
                <option value="receive">{OP_LABEL.receive}</option>
                <option value="adjust">{OP_LABEL.adjust}</option>
                <option value="transfer">{OP_LABEL.transfer}</option>
              </select>
            </div>
            {op === "adjust" ? (
              <div className="field">
                <label className="field__label" htmlFor="stock-reason">Motivo del ajuste *</label>
                <input
                  id="stock-reason"
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Merma por caducidad"
                  required
                />
              </div>
            ) : null}
          </div>

          {op === "receive" || op === "adjust" ? (
            <p className="org-page__muted" style={{ margin: 0 }}>
              Almacén: <span className="org-page__code">{warehouses.find((w) => w.id === selectedId)?.code ?? "?"}</span>
            </p>
          ) : (
            <div className="org-form-grid">
              <div className="field">
                <label className="field__label" htmlFor="stock-from">Origen *</label>
                <select id="stock-from" className="input" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                  <option value="">— origen —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="stock-to">Destino *</label>
                <select id="stock-to" className="input" value={toId} onChange={(e) => setToId(e.target.value)} required>
                  <option value="">— destino —</option>
                  {warehouses.filter((w) => w.id !== fromId).map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {lines.length === 0 ? (
            <p className="org-page__muted">
              {pickable === null
                ? "Este almacén no tiene existencias todavía: registra la primera compra (una recepción no necesita existencias previas)."
                : "Elige el producto y agrega la línea del movimiento."}
            </p>
          ) : (
            <ul className="org-page__list">
              {lines.map((line, index) => (
                <li className="org-page__list-item" key={`${line.variantId}-${index}`}>
                  <strong>{line.label}</strong>
                  <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="input"
                      style={{ width: 90, textAlign: "right" }}
                      value={line.quantity}
                      aria-label={`Cantidad de ${line.label}`}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                    />
                    {op !== "transfer" && tracksLot ? (
                      <input
                        className="input"
                        style={{ width: 110 }}
                        value={line.lotCode}
                        aria-label={`Lote de ${line.label}`}
                        placeholder="LOTE-01"
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === index ? { ...l, lotCode: e.target.value } : l)),
                          )
                        }
                      />
                    ) : null}
                    {op !== "transfer" && tracksExpiry ? (
                      <input
                        className="input"
                        style={{ width: 150 }}
                        type="date"
                        value={line.expiryDate}
                        aria-label={`Caducidad de ${line.label}`}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === index ? { ...l, expiryDate: e.target.value } : l)),
                          )
                        }
                      />
                    ) : null}
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Quitar ${line.label}`}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={addLine}
              disabled={pickable === null}
            >
              Agregar línea
            </button>
            {pickable !== null ? (
              <select
                className="input"
                style={{ maxWidth: 340 }}
                aria-label="Producto de la línea"
                value=""
                onChange={(e) => {
                  if (e.target.value !== "") pickVariant(e.target.value);
                }}
              >
                <option value="">— elegir producto —</option>
                {balances.map((balance) => (
                  <option key={balance.variantId} value={balance.variantId}>
                    {balance.productName} · {balance.sku}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {error !== null ? (
            <p className="org-page__form-error" role="alert">{error.userMessage}</p>
          ) : null}
          {success !== null ? <p className="org-page__form-success">{success}</p> : null}

          <div>
            <button type="submit" className="btn btn--primary" disabled={disableSubmit}>
              {busy
                ? "Registrando…"
                : op === "receive"
                  ? "Registrar recepción"
                  : op === "adjust"
                    ? "Registrar ajuste"
                    : "Registrar traspaso"}
            </button>
          </div>
          {units !== null ? (
            <p className="org-page__muted" style={{ margin: 0 }}>
              Giro <span className="org-page__code">{units.verticalCode}</span>
              {tracksLot ? " — exige lote en toda entrada" : ""}
              {tracksExpiry ? " y caducidad" : ""}.
            </p>
          ) : null}
        </form>
      ) : null}
    </>
  );
}

// ---- Movements ----

function MovementRow({ movement }: { movement: MovementView }) {
  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Badge tone={movement.direction === "IN" ? "success" : "neutral"}>
          {movement.direction === "IN" ? "ENTRADA" : "SALIDA"}
        </Badge>
        <strong>{CAUSE_LABEL[movement.cause] ?? movement.cause}</strong>
        <span className="org-page__code">{movement.warehouseCode}</span>
        <span>{qty(movement.quantity)} {movement.sku ?? ""}</span>
        <span className="org-page__muted">{when(movement.createdAt)}</span>
      </div>
      <p className="org-page__muted" style={{ margin: 0 }}>
        {movement.lotCode !== null ? `Lote ${movement.lotCode} · ` : ""}
        {movement.expiryDate !== null ? `caduca ${movement.expiryDate} · ` : ""}
        {movement.reference !== null ? `ref ${movement.reference} · ` : ""}
        {movement.note ?? ""}
      </p>
    </div>
  );
}
