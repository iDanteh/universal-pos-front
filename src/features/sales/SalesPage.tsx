import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import {
  catalogProducts,
  catalogTaxes,
  catalogUnits,
  type CatalogUnits,
  type ProductView,
  type TaxRateView,
  type VariantView,
} from "@/api/catalog";
import {
  cancelSale,
  createReturn,
  createSale,
  listReturns,
  listSales,
  type ReturnView,
  type SaleLineView,
  type SaleView,
} from "@/api/sales";
import { issueCreditNote } from "@/api/invoicing";
import {
  listWarehouses,
  type WarehouseView,
} from "@/api/inventory";

/** Display-only money formatting of backend NUMERIC strings (never floats on the wire). */
function money(value: string): string {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Money-safe round to cents (HALF_UP-equivalent for display math only). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function folioLabel(folio: number): string {
  return `SV-${String(folio).padStart(6, "0")}`;
}

interface CartLine {
  readonly variantId: string;
  readonly label: string;
  readonly unitPrice: string;
  readonly quantity: string;
  /** Rate fraction captured at add-time (v0.8 · ADR-018); 0 = sin impuesto. */
  readonly taxRate: number;
  /** Snapshot code for the line chip ("" = sin impuesto). */
  readonly taxRateCode: string;
}

/** Per-line display math mirrors the backend rule: tax ONCE on the line net. */
function lineNet(line: CartLine): number {
  return round2(Number.parseFloat(line.unitPrice || "0") * Number.parseFloat(line.quantity || "0"));
}

function lineTax(line: CartLine): number {
  return round2(lineNet(line) * line.taxRate);
}

interface CartPayment {
  readonly method: string;
  readonly amount: string;
}

const METHOD_LABEL: Readonly<Record<string, string>> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const METHOD_OPTIONS = ["CASH", "CARD", "TRANSFER", "OTHER"] as const;

/** Status chips are SEMANTIC (green/red) so the history is scan-readable. */
const SALE_STATUS: Readonly<Record<string, { tone: "success" | "danger"; label: string }>> = {
  COMPLETED: { tone: "success", label: "Completada" },
  CANCELED: { tone: "danger", label: "Cancelada" },
};

/**
 * VENTAS page (fase 4): a compact POS screen for the admin console — build a
 * sale from the tenant's catalog variants, pay it EXACTLY, and see the recent
 * folio history. The backend owns every rule (snapshot prices, payments must
 * sum the total, idempotency) and re-validates it all.
 */
export function SalesPage() {
  const { activeTenantId } = useAuth();
  const unitsRes = useApiResource<CatalogUnits>(catalogUnits);
  const productsRes = useApiResource<readonly ProductView[]>(catalogProducts);
  const salesRes = useApiResource<readonly SaleView[]>(listSales);
  const returnsRes = useApiResource<readonly ReturnView[]>(listReturns);
  const warehousesRes = useApiResource<readonly WarehouseView[]>(listWarehouses);
  const taxesRes = useApiResource<readonly TaxRateView[]>(catalogTaxes);

  const firstRun = useRef(true);

  // Tenant switched from the topbar: cart and history belong to the ACTIVE tenant.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    productsRes.reload();
    salesRes.reload();
    returnsRes.reload();
    warehousesRes.reload();
    taxesRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  /** Reload hook shared by sale/return mutations (history + feed move together). */
  const reloadHistory = () => {
    salesRes.reload();
    returnsRes.reload();
  };

  return (
    <section aria-labelledby="sales-title">
      <div className="page-header">
        <h1 id="sales-title">Ventas</h1>
        <p>
          Cobro con snapshot de precios del catálogo, pagos exactos (con
          calculadora de cambio en efectivo para la caja) y folios por
          organización. Cada venta registra la línea tal como se cobró. Las
          ventas COMPLETED aceptan devoluciones parciales (el reembolso
          prorratea el snapshot cobrado) y, si tienen factura timbrada, una
          nota de crédito CFDI tipo E.
        </p>
      </div>

      {unitsRes.error !== null ? (
        <ErrorNotice error={unitsRes.error} onRetry={unitsRes.reload} />
      ) : null}

      <div className="org-grid">
        <div className="card card--pad">
          <NewSaleCard
            key={activeTenantId ?? ""}
            productsRes={productsRes}
            unitsRes={unitsRes}
            warehouses={warehousesRes.data ?? []}
            taxes={taxesRes.data ?? []}
            onCreated={() => reloadHistory()}
          />
        </div>

        <div className="card card--pad org-grid__wide">
          <div className="card__title">Ventas recientes</div>
          {salesRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando ventas…
            </span>
          ) : salesRes.error !== null ? (
            <ErrorNotice error={salesRes.error} onRetry={salesRes.reload} />
          ) : (salesRes.data ?? []).length === 0 ? (
            <p className="org-page__muted">Aún no hay ventas. Cobra la primera a la izquierda.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {(salesRes.data ?? []).map((sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  returns={(returnsRes.data ?? []).filter((r) => r.saleId === sale.id)}
                  onChanged={reloadHistory}
                />
              ))}
            </div>
          )}

          {returnsRes.error !== null ? (
            <ErrorNotice error={returnsRes.error} onRetry={returnsRes.reload} />
          ) : (returnsRes.data ?? []).length > 0 ? (
            <div style={{ marginTop: "var(--space-4)" }}>
              <div className="card__title" style={{ marginBottom: "var(--space-2)" }}>
                Devoluciones recientes
              </div>
              <ul className="org-page__list">
                {(returnsRes.data ?? []).slice(0, 8).map((ret) => (
                  <li key={ret.id} className="org-page__list-item">
                    <span style={{ display: "flex", gap: "var(--space-3)", alignItems: "baseline" }}>
                      <strong>{ret.folioLabel}</strong>
                      <span className="org-page__muted">
                        venta SV-{String(ret.saleFolio).padStart(6, "0")} · −$
                        {money(ret.total)} {ret.currency} · reembolso{" "}
                        {METHOD_LABEL[ret.refundMethod] ?? ret.refundMethod}
                      </span>
                      {ret.creditNoteLabel !== null ? (
                        <Badge tone="neutral">NC {ret.creditNoteLabel}</Badge>
                      ) : null}
                    </span>
                    <span className="org-page__muted">
                      {ret.lines
                        .map((l) => `${money(l.quantity)} × ${l.sku}`)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface VariantWithProduct extends VariantView {
  readonly productName: string;
}

function variantOptions(products: readonly ProductView[]): readonly VariantWithProduct[] {
  return products.flatMap((p) =>
    p.variants.map((v) => ({ ...v, productName: p.name })),
  );
}

/** Remounts on tenant change (key={activeTenantId}) so no stale item leaks. */
function NewSaleCard({
  productsRes,
  unitsRes,
  warehouses,
  taxes,
  onCreated,
}: {
  productsRes: ReturnType<typeof useApiResource<readonly ProductView[]>>;
  unitsRes: ReturnType<typeof useApiResource<CatalogUnits>>;
  warehouses: readonly WarehouseView[];
  taxes: readonly TaxRateView[];
  onCreated: () => void;
}) {
  const variants = variantOptions(productsRes.data ?? []);

  const activeWarehouses = warehouses.filter((wh) => wh.active);
  // >= 2 active warehouses -> the backend REQUIRES an explicit warehouseId.
  const needsWarehouse = activeWarehouses.length >= 2;

  const [variantId, setVariantId] = useState("");
  const [note, setNote] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [payments, setPayments] = useState<readonly CartPayment[]>([
    { method: "CASH", amount: "" },
  ]);
  const [cashReceived, setCashReceived] = useState("");
  /** Change surfaced when a typed payment rebased the total (clamped to the exact remainder). */
  const [capNotice, setCapNotice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const units = unitsRes.data;

  // Default warehouse once the list loads (tenant-scoped by remount).
  useEffect(() => {
    setWarehouseId((current) => {
      if (current !== "") return current;
      const first = activeWarehouses[0];
      return needsWarehouse && first !== undefined ? first.id : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses]);

  useEffect(() => {
    setVariantId((current) =>
      current === "" ? (variants[0]?.id ?? current) : current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsRes.data]);

  // SOLO PANTALLA: el total real lo calcula el backend (impuesto por línea,
  // HALF_UP a 2 decimales — v0.8 · ADR-018). Subtotal = Σ nets, impuestos =
  // Σ lineTaxes ya redondeados (nunca se re-redondea).
  const subtotal = lines.reduce((sum, line) => sum + lineNet(line), 0);
  const taxTotal = lines.reduce((sum, line) => sum + lineTax(line), 0);
  const total = round2(subtotal + taxTotal);
  const paid = payments.reduce((sum, p) => sum + Number.parseFloat(p.amount || "0"), 0);
  const remaining = round2(total - paid);

  // Cash-change calculator (UI only — the backend always records the NET
  // charge; rule: payments must sum EXACTLY the total, per ADR-014).
  const cashDue = (() => {
    if (lines.length === 0) return 0;
    const nonCash = payments
      .filter((p) => p.method !== "CASH")
      .reduce((sum, p) => sum + Number.parseFloat(p.amount || "0"), 0);
    return Math.max(0, round2(total - nonCash));
  })();
  const receivedNum = Number.parseFloat(cashReceived || "0");
  const changeDue =
    lines.length > 0 && cashReceived !== ""
      ? round2(receivedNum - cashDue)
      : null;

  const variant = variants.find((v) => v.id === variantId) ?? null;

  const addLine = () => {
    if (variant === null) return;
    const rate = Number.parseFloat(
      (taxes.find((t) => t.code === variant.taxRateCode)?.rate ?? "0"),
    );
    const taxRate = Number.isNaN(rate) ? 0 : rate;
    const net = round2(Number.parseFloat(variant.price || "0") * 1);
    setLines((prev) => [
      ...prev,
      {
        variantId: variant.id,
        label: `${variant.productName} · ${variant.sku}`,
        unitPrice: variant.price ?? "",
        quantity: "1",
        taxRate,
        taxRateCode: variant.taxRateCode ?? "",
      },
    ]);
    // First line -> pre-record the exact CASH charge (cashier can still edit it).
    fillExactCash(
      lines.length + 1,
      round2(total + net + round2(net * taxRate)),
    );
  };

  /**
   * Records the NET cash charge (total − non-cash payments) into the LAST CASH
   * row. Both params are "already-committed" values: callers that mutate state
   * in the same tick (addLine) pass the post-mutation values to dodge the
   * stale closure; event handlers on fresh renders use the defaults.
   */
  const fillExactCash = (committedLines: number = lines.length, committedTotal: number = total) => {
    setPayments((prev) => {
      if (committedLines === 0) return prev;
      const lastCashIdx = prev.map((p) => p.method).lastIndexOf("CASH");
      if (lastCashIdx === -1) return prev;
      const nonCash = prev
        .filter((p) => p.method !== "CASH")
        .reduce((sum, p) => sum + Number.parseFloat(p.amount || "0"), 0);
      const due = Math.max(
        0,
        round2(committedTotal - nonCash),
      );
      return prev.map((p, i) => (i === lastCashIdx ? { ...p, amount: due.toFixed(2) } : p));
    });
  };

  /**
   * Typing the BILL received must never end up in the payment record: the
   * recorded CASH payment stays the exact net charge and the drawer money
   * (cambio) is displayed below. This is the UI equivalent of the domain rule
   * "payments must sum EXACTLY the total" (cash-change handling arrives with
   * the caja module).
   */
  const onCashReceived = (value: string) => {
    setCashReceived(value);
    fillExactCash();
  };

  /**
   * Typing a payment amount can never rebase the sale total (ADR-014: payments
   * sum EXACTLY the total; the excess is CAMBIO, an operation of the caja —
   * ADR-017). If the entered amount exceeds the remaining due it is clamped to
   * the exact remainder and the overage is surfaced as change for the drawer.
   */
  const onPaymentAmount = (index: number, value: string) => {
    const other = payments
      .filter((_, i) => i !== index)
      .reduce((sum, p) => sum + Number.parseFloat(p.amount || "0"), 0);
    const entered = Number.parseFloat(value);
    const remainingDue = Math.max(0, round2(total - other));
    const over =
      value !== "" && !Number.isNaN(entered) && entered > remainingDue;
    setCapNotice(over ? round2(entered - remainingDue) : null);
    setPayments((prev) =>
      prev.map((p, i) =>
        i === index
          ? { ...p, amount: over ? remainingDue.toFixed(2) : value }
          : p,
      ),
    );
  };

  const autoFillRemainder = () => {
    if (lines.length === 0) return;
    const current = paid;
    const deficit = round2(total - current);
    setPayments((prev) =>
      prev.map((p, i) => (i === prev.length - 1 ? { ...p, amount: deficit.toFixed(2) } : p)),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const sale = await createSale(crypto.randomUUID(), {
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          ...(line.unitPrice === "" ? {} : { unitPrice: line.unitPrice }),
        })),
        payments: payments.map((p) => ({
          method: p.method as "CASH" | "CARD" | "TRANSFER" | "OTHER",
          amount: p.amount,
        })),
        ...(note === "" ? {} : { note }),
        ...(needsWarehouse && warehouseId !== "" ? { warehouseId } : {}),
      });
      const changeToGive =
        capNotice !== null
          ? capNotice
          : changeDue !== null && changeDue > 0
            ? changeDue
            : 0;
      const changeText =
        changeToGive > 0 ? ` · cambio a entregar: ${money(changeToGive.toFixed(2))}` : "";
      setSuccess(`Venta ${folioLabel(sale.folio)} cobrada por ${money(sale.total)} ${sale.currency}${changeText}.`);
      setLines([]);
      setPayments([{ method: "CASH", amount: "" }]);
      setCashReceived("");
      setNote("");
      setCapNotice(null);
      onCreated();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card__title">Nueva venta</div>
      {productsRes.loading || unitsRes.loading ? (
        <span className="loading-block">
          <span className="spinner" aria-hidden="true" /> Cargando catálogo…
        </span>
      ) : variants.length === 0 ? (
        <p className="org-page__muted">
          Crea variantes en el <a href="/catalogo">catálogo</a> para poder vender.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-4)" }}>
          {needsWarehouse ? (
            <div className="field">
              <label className="field__label" htmlFor="sale-warehouse">Almacén de la venta *</label>
              <select
                id="sale-warehouse"
                className="input"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
              >
                {activeWarehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code} — {wh.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label className="field__label" htmlFor="sale-variant">Producto / variante</label>
            <select
              id="sale-variant"
              className="input"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.productName} · {v.sku}
                  {v.price !== null ? ` (${money(v.price)})` : " (sin precio)"}
                  {v.taxRateCode !== null && v.taxRateCode !== "" ? ` · ${v.taxRateCode}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={addLine}
              disabled={variant === null}
            >
              Agregar línea
            </button>
          </div>

          {lines.length > 0 ? (
            <ul className="org-page__list">
              {lines.map((line, index) => (
                <li className="org-page__list-item" key={`${line.variantId}-${index}`}>
                  <strong>{line.label}</strong>
                  <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    <input
                      className="input input--compact"
                      style={{ width: 76, textAlign: "right" }}
                      type="number"
                      min="0.001"
                      step="0.001"
                      inputMode="decimal"
                      value={line.quantity}
                      aria-label={`Cantidad de ${line.label}`}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                    />
                    <span>×</span>
                    <input
                      className="input input--compact"
                      style={{ width: 104, textAlign: "right" }}
                      value={line.unitPrice}
                      aria-label={`Precio de ${line.label}`}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, unitPrice: e.target.value } : l)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Quitar ${line.label}`}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    >
                      ✕
                    </button>
                  </span>
                  {line.taxRateCode !== "" ? (
                    <span className="org-page__muted" style={{ marginTop: "var(--space-1)" }}>
                      {line.taxRateCode} · neto ${money(lineNet(line).toFixed(2))} + impuesto $
                      {money(lineTax(line).toFixed(2))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="meta-list__row">
            <dt>Subtotal</dt>
            <dd>{money(subtotal.toFixed(2))}</dd>
          </div>
          <div className="meta-list__row">
            <dt>Impuestos</dt>
            <dd>{money(taxTotal.toFixed(2))}</dd>
          </div>
          <div className="meta-list__row">
            <dt>Total (pantalla)</dt>
            <dd>{money(total.toFixed(2))}</dd>
          </div>

          <div>
            <p className="card__title" style={{ marginBottom: "var(--space-2)" }}>Pagos</p>
            {payments.map((payment, index) => (
              <div className="org-form-grid" key={index} style={{ marginBottom: "var(--space-2)" }}>
                <div className="field">
                  <label className="field__label" htmlFor={`pay-method-${index}`}>Método</label>
                  <select
                    id={`pay-method-${index}`}
                    className="input input--method"
                    value={payment.method}
                    onChange={(e) => {
                      const method = e.target.value;
                      setPayments((prev) =>
                        prev.map((p, i) => (i === index ? { ...p, method } : p)),
                      );
                    }}
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`pay-amount-${index}`}>
                    {payment.method === "CASH" ? "Cobro en efectivo — NETO (MXN)" : "Monto (MXN)"}
                    {lines.length > 0 ? ` — resta ${money(remaining.toFixed(2))}` : ""}
                  </label>
                  <input
                    id={`pay-amount-${index}`}
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={payment.amount}
                    onChange={(e) => onPaymentAmount(index, e.target.value)}
                  />
                  {payment.method === "CASH" ? (
                    <p className="org-page__muted" style={{ margin: "var(--space-1) 0 0" }}>
                      El billete que entregó el cliente se captura abajo en "Recibí"; aquí va el
                      cobro neto (la venta registra pagos = total exacto).
                    </p>
                  ) : null}
                </div>
                {payments.length > 1 ? (
                  <div className="field" style={{ display: "flex", alignItems: "end" }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setPayments((prev) => prev.filter((_, i) => i !== index))}
                    >
                      Quitar pago
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={lines.length === 0}
                onClick={autoFillRemainder}
              >
                Pagar resto exacto
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPayments((prev) => [...prev, { method: "CARD", amount: "" }])}
              >
                Agregar pago
              </button>
            </div>

            {capNotice !== null ? (
              <p className="org-page__form-success" role="status">
                El pago rebasaba el total: se registró el cobro exacto y ${money(capNotice.toFixed(2))}{" "}
                van como cambio a entregar por caja (el cambio es operación de caja — ADR-014/017).
              </p>
            ) : null}

            {lines.length > 0 && payments.some((p) => p.method === "CASH") ? (
              <div className="org-form-grid">
                <div className="field">
                  <label className="field__label" htmlFor="cash-received">
                    Recibí en efectivo (billete o monto)
                  </label>
                  <input
                    id="cash-received"
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Ej. 20 — aunque la venta sea de 12.50"
                    value={cashReceived}
                    onChange={(e) => onCashReceived(e.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="field__label">Cambio a entregar</span>
                  <div
                    aria-live="polite"
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius-compact)",
                      border:
                        cashReceived !== "" && changeDue !== null && changeDue >= 0
                          ? "1px solid var(--color-success-bg)"
                          : "1px solid var(--color-outline)",
                      background:
                        cashReceived !== "" && changeDue !== null && changeDue >= 0
                          ? "var(--color-success-bg)"
                          : "var(--color-gallery-white)",
                      fontWeight: 600,
                      color:
                        cashReceived !== "" && changeDue !== null && changeDue < 0
                          ? "var(--color-danger)"
                          : "var(--color-ink)",
                    }}
                  >
                    {cashReceived === "" ? (
                      <span className="org-page__muted">
                        Captura el billete recibido: el cobro se registra exacto y aquí ves el
                        cambio para la caja.
                      </span>
                    ) : changeDue !== null && changeDue >= 0 ? (
                      <>
                        <span style={{ fontSize: "1.25em" }}>${money(changeDue.toFixed(2))}</span>
                        {"  "}· recibí {money(receivedNum.toFixed(2))} − cobro{" "}
                        {money(cashDue.toFixed(2))}
                      </>
                    ) : (
                      <span className="org-page__form-error">
                        El efectivo no cubre el cobro — faltan{" "}
                        {money((-(changeDue ?? 0)).toFixed(2))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sale-note">Nota (opcional)</label>
            <input
              id="sale-note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mesa 4 · cliente recurrente"
            />
          </div>

          {error !== null ? (
            <p className="org-page__form-error" role="alert">{error.userMessage}</p>
          ) : null}
          {success !== null ? <p className="org-page__form-success">{success}</p> : null}

          <div>
            <button
              type="submit"
              className="btn btn--primary btn--charge"
              disabled={busy || lines.length === 0}
            >
              {busy ? "Cobrando…" : `Cobrar ${money(total.toFixed(2))}`}
            </button>
          </div>
          {units !== null ? (
            <p className="org-page__muted" style={{ margin: 0 }}>
              Giro <span className="org-page__code">{units.verticalCode}</span> — los precios
              quedan como snapshot de la venta.
            </p>
          ) : null}
        </form>
      )}
    </>
  );
}

interface ReturnLineDraft {
  readonly line: SaleLineView;
  /** "" = nothing returned from this line in the draft. */
  readonly quantity: string;
}

/** Prorated display math mirrors the backend rule (ADR-019): net and tax come
 * from the SNAPSHOT proportionally to the returned quantity — the refund can
 * never be an amount different from what was charged for those units. */
function returnLineMoney(line: SaleLineView, wanted: number): { net: number; tax: number } {
  const originalQty = Number.parseFloat(line.quantity);
  const net = round2(
    (Number.parseFloat(line.lineTotal) * wanted) / originalQty,
  );
  const tax = round2(
    (Number.parseFloat(line.taxTotal) * wanted) / originalQty,
  );
  return { net, tax };
}

function SaleRow({
  sale,
  returns,
  onChanged,
}: {
  sale: SaleView;
  returns: readonly ReturnView[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [drafts, setDrafts] = useState<readonly ReturnLineDraft[]>([]);
  const [refundMethod, setRefundMethod] = useState<string>("CASH");
  const [refundReference, setRefundReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyNote, setBusyNote] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelSale(sale.id, reason);
      setOpen(false);
      setReason("");
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  // Units already returned per sale line (prior devoluciones of THIS sale).
  const returnedByLineId = new Map<string, number>();
  for (const ret of returns) {
    for (const line of ret.lines) {
      const current = returnedByLineId.get(line.saleLineId) ?? 0;
      returnedByLineId.set(
        line.saleLineId,
        current + Number.parseFloat(line.quantity),
      );
    }
  }

  /** Fresh draft (0 for every line) each time the panel opens. */
  const toggleReturn = () => {
    if (!returnOpen) {
      setDrafts(sale.lines.map((line) => ({ line, quantity: "" })));
      setRefundMethod("CASH");
      setRefundReference("");
      setNote("");
    }
    setReturnOpen((v) => !v);
    setError(null);
    setNotice(null);
  };

  const draftDetails = drafts.map((draft) => {
    const originalQty = Number.parseFloat(draft.line.quantity);
    const returnable = round2(originalQty - (returnedByLineId.get(draft.line.id) ?? 0));
    const wanted = Number.parseFloat(draft.quantity || "0");
    const money2 = Number.isNaN(wanted) || wanted <= 0
      ? { net: 0, tax: 0 }
      : returnLineMoney(draft.line, wanted);
    const exceeds = !Number.isNaN(wanted) && wanted > returnable;
    return { ...draft, returnable, wanted, ...money2, exceeds };
  });
  const anyExceeds = draftDetails.some((d) => d.exceeds);
  const hasSelection = draftDetails.some((d) => !Number.isNaN(d.wanted) && d.wanted > 0);
  const refundPreview = round2(
    draftDetails.reduce((sum, d) => sum + d.net + d.tax, 0),
  );

  const submitReturn = async (event: FormEvent) => {
    event.preventDefault();
    const selected = draftDetails.filter((d) => !Number.isNaN(d.wanted) && d.wanted > 0);
    if (selected.length === 0 || anyExceeds) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createReturn(sale.id, crypto.randomUUID(), {
        lines: selected.map((d) => ({
          saleLineId: d.line.id,
          quantity: String(d.wanted),
        })),
        refundMethod: refundMethod as "CASH" | "CARD" | "TRANSFER" | "OTHER",
        ...(refundReference === "" ? {} : { refundReference }),
        ...(note === "" ? {} : { note }),
      });
      setNotice(
        `Devolución ${created.folioLabel} registrada: reembolso de $${money(created.total)} ` +
          `${created.currency} vía ${METHOD_LABEL[created.refundMethod] ?? created.refundMethod}.`,
      );
      setDrafts([]);
      setNote("");
      setRefundReference("");
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const issueNote = async (returnId: string) => {
    setBusyNote(true);
    setError(null);
    setNotice(null);
    try {
      const creditNote = await issueCreditNote({ returnId });
      setNotice(
        `Nota de crédito ${creditNote.folioLabel} emitida por $${money(creditNote.total)} ` +
          `(CFDI tipo E, relacionada con la factura de la venta).`,
      );
      onChanged();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusyNote(false);
    }
  };

  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
        <strong>{folioLabel(sale.folio)}</strong>
        <span className="org-page__code">{sale.currency}</span>
        <span style={{ fontWeight: 600 }}>${money(sale.total)}</span>
        {sale.taxTotal !== "0.00" ? (
          <span className="org-page__muted">imp. ${money(sale.taxTotal)}</span>
        ) : null}
        {returns.length > 0 ? (
          <Badge tone="neutral">{returns.length} devoluc.</Badge>
        ) : null}
        <Badge tone={SALE_STATUS[sale.status]?.tone ?? "neutral"}>
          {SALE_STATUS[sale.status]?.label ?? sale.status}
        </Badge>
        <span className="org-page__muted">
          {new Date(sale.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>
      <p className="org-page__muted" style={{ margin: 0 }}>
        {sale.lines
          .map((l) => {
            const tax =
              l.taxTotal !== "0.00" ? ` + ${money(l.taxTotal)} ${l.taxRateCode ?? ""}` : "";
            return `${money(l.quantity)} × ${l.sku} @ ${money(l.unitPrice)}${tax}`;
          })
          .join(" · ")}
        {" — pagos: "}
        {sale.payments.map((p) => `${METHOD_LABEL[p.method] ?? p.method} ${money(p.amount)}`).join(" + ")}
      </p>
      {sale.statusReason !== null ? (
        <p className="org-page__muted" style={{ margin: 0 }}>Motivo: {sale.statusReason}</p>
      ) : null}

      {sale.status === "COMPLETED" ? (
        <div className="org-page__add" style={{ marginTop: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Cerrar" : "Cancelar venta"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              aria-expanded={returnOpen}
              onClick={toggleReturn}
            >
              {returnOpen ? "Cerrar devolución" : "Devolver"}
            </button>
          </div>

          {open ? (
            <form
              className="org-form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void cancel();
              }}
            >
              <div className="field">
                <label className="field__label" htmlFor={`cancel-${sale.id}`}>Motivo *</label>
                <input
                  id={`cancel-${sale.id}`}
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Cliente se arrepintió"
                  required
                />
              </div>
              {error !== null ? <p className="org-page__form-error">{error.userMessage}</p> : null}
              <div>
                <button type="submit" className="btn btn--primary" disabled={busy}>
                  {busy ? "Cancelando…" : "Confirmar cancelación"}
                </button>
              </div>
            </form>
          ) : null}

          {returnOpen ? (
            <form
              className="org-form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void submitReturn(event);
              }}
            >
              <p className="org-page__muted" style={{ margin: 0 }}>
                Cantidades a devolver por línea (el reembolso prorratea el
                snapshot de la venta — v0.9 · ADR-019).
              </p>
              {draftDetails.map((draft, index) => (
                <div className="org-form-grid" key={draft.line.id}>
                  <div className="field">
                    <label className="field__label" htmlFor={`ret-qty-${draft.line.id}`}>
                      {draft.line.sku} — devueltas {Number.parseFloat(draft.line.quantity) -
                        (returnedByLineId.get(draft.line.id) ?? 0)} de {draft.line.quantity}{" "}
                      {draft.line.unit}
                    </label>
                    <input
                      id={`ret-qty-${draft.line.id}`}
                      className="input input--compact"
                      style={{ width: 96, textAlign: "right" }}
                      type="number"
                      min="0"
                      max={draft.returnable}
                      step="0.001"
                      inputMode="decimal"
                      value={draft.quantity}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((d, i) =>
                            i === index ? { ...d, quantity: e.target.value } : d,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <span className="field__label">Reembolso de la línea</span>
                    <span>
                      ${money(round2(draft.net + draft.tax).toFixed(2))}
                      {draft.tax > 0 ? (
                        <span className="org-page__muted">
                          {" "}(incluye impuesto ${money(draft.tax.toFixed(2))})
                        </span>
                      ) : null}
                      {draft.exceeds ? (
                        <span className="org-page__form-error">
                          {" "}— excede lo returnable ({draft.returnable})
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}

              <div className="org-form-grid">
                <div className="field">
                  <label className="field__label" htmlFor={`ret-method-${sale.id}`}>
                    Método del reembolso
                  </label>
                  <select
                    id={`ret-method-${sale.id}`}
                    className="input input--method"
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                  >
                    {METHOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={`ret-ref-${sale.id}`}>
                    Referencia (opcional)
                  </label>
                  <input
                    id={`ret-ref-${sale.id}`}
                    className="input"
                    value={refundReference}
                    onChange={(e) => setRefundReference(e.target.value)}
                    placeholder="Folio de terminal / voucher"
                  />
                </div>
                <div className="field">
                  <span className="field__label">Total del reembolso</span>
                  <span style={{ fontWeight: 600 }}>
                    ${money(refundPreview.toFixed(2))} {sale.currency}
                  </span>
                </div>
              </div>
              <div className="field">
                <label className="field__label" htmlFor={`ret-note-${sale.id}`}>Nota (opcional)</label>
                <input
                  id={`ret-note-${sale.id}`}
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Producto defectuoso"
                />
              </div>

              {error !== null ? (
                <p className="org-page__form-error" role="alert">{error.userMessage}</p>
              ) : null}
              {notice !== null ? <p className="org-page__form-success">{notice}</p> : null}
              <div>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={busy || !hasSelection || anyExceeds}
                >
                  {busy ? "Registrando…" : "Registrar devolución"}
                </button>
              </div>
            </form>
          ) : null}

          {returns.length > 0 ? (
            <ul className="org-page__list" style={{ marginTop: "var(--space-2)" }}>
              {returns.map((ret) => (
                <li key={ret.id} className="org-page__list-item">
                  <span style={{ display: "flex", gap: "var(--space-3)", alignItems: "baseline" }}>
                    <strong>{ret.folioLabel}</strong>
                    <span className="org-page__muted">
                      −${money(ret.total)} {ret.currency} ·{" "}
                      {ret.lines.map((l) => `${money(l.quantity)} × ${l.sku}`).join(" + ")}
                    </span>
                  </span>
                  <span style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    {ret.creditNoteLabel !== null ? (
                      <Badge tone="neutral">NC {ret.creditNoteLabel}</Badge>
                    ) : null}
                    {ret.creditNoteIssuable ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busyNote}
                        onClick={() => {
                          void issueNote(ret.id);
                        }}
                      >
                        {busyNote ? "Emitiendo…" : "Emitir nota de crédito"}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
