import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import { listCashSessions, type CashSessionView } from "@/api/cash";
import {
  getSalesReport,
  getTaxesReport,
  getZReport,
  type MethodRow,
  type SalesReport,
  type TaxesReport,
  type TaxRow,
  type ZReport,
} from "@/api/reports";

/**
 * REPORTES + CORTE Z (fase 13 · ADR-023): the admin reads the SAME snapshots
 * the register wrote — never a recomputation. The date range is inclusive in
 * the tenant's business time zone (the backend resolves the boundary), and
 * the Z corte is the ledger of ONE drawer (open or closed), printable as the
 * physical cut handed to the shift supervisor.
 *
 * SOLO PANTALLA rule: this page formats server numbers; it never recomputes
 * totals, taxes, refunds or the drawer expectation.
 */

type Tab = "sales" | "taxes" | "z";

const METHOD_LABEL: Readonly<Record<string, string>> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otros",
};

const methodLabel = (method: string): string => METHOD_LABEL[method] ?? method;

const money = (value: string | null): string => {
  if (value === null) return "—";
  return Number.parseFloat(value).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const when = (iso: string | null): string => {
  if (iso === null) return "—";
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
};

const dayLabel = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

/** Today in the tenant's business zone (report ranges are local dates). */
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const percent = (rate: string | null): string => {
  if (rate === null) return "—";
  return `${(Number.parseFloat(rate) * 100).toLocaleString("es-MX", {
    maximumFractionDigits: 4,
  })}%`;
};

export function ReportsPage() {
  const { activeTenantId, can } = useAuth();
  const today = todayIso();

  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(shiftIso(today, -6));
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ from: shiftIso(today, -6), to: today });

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [taxes, setTaxes] = useState<TaxesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const loadRange = async (range: { from: string; to: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [salesReport, taxesReport] = await Promise.all([
        getSalesReport(range.from, range.to),
        getTaxesReport(range.from, range.to),
      ]);
      setSales(salesReport);
      setTaxes(taxesReport);
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setLoading(false);
    }
  };

  // First load + tenant switch (the ledger is tenant-scoped).
  const firstRun = useRef(true);
  const prevTenant = useRef(activeTenantId);
  useEffect(() => {
    if (!firstRun.current && prevTenant.current === activeTenantId) return;
    firstRun.current = false;
    prevTenant.current = activeTenantId;
    void loadRange(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const applyRange = () => {
    const next = { from, to };
    setApplied(next);
    void loadRange(next);
  };

  const canZ = can("sales.read", "cash.operate");

  return (
    <section aria-labelledby="reports-title">
      <div className="page-header no-print">
        <h1 id="reports-title">Reportes</h1>
        <p>
          Cortes de venta, impuestos trasladados/retenidos y el corte Z de cada
          turno. Todas las cifras salen de los snapshots que el punto de venta
          guardó: la página solo presenta, nunca recalcula.
        </p>
      </div>

      <div className="report-tabs no-print" role="tablist" aria-label="Secciones de reportes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sales"}
          className={tab === "sales" ? "report-tab report-tab--on" : "report-tab"}
          onClick={() => setTab("sales")}
        >
          Ventas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "taxes"}
          className={tab === "taxes" ? "report-tab report-tab--on" : "report-tab"}
          onClick={() => setTab("taxes")}
        >
          Impuestos
        </button>
        {canZ ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "z"}
            className={tab === "z" ? "report-tab report-tab--on" : "report-tab"}
            onClick={() => setTab("z")}
          >
            Corte Z
          </button>
        ) : null}
      </div>

      {tab !== "z" ? (
        <div className="card card--pad no-print" style={{ marginBottom: "var(--space-5)" }}>
          <div className="report-filters">
            <label className="field">
              <span className="field__label">Desde</span>
              <input
                className="input input--compact"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Hasta</span>
              <input
                className="input input--compact"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary"
              onClick={applyRange}
              disabled={loading || from === "" || to === ""}
            >
              {loading ? "Calculando…" : "Aplicar rango"}
            </button>
            <span className="org-page__muted">
              Días locales ({sales?.range.timeZone ?? "America/Mexico_City"}), inclusive.
            </span>
          </div>
        </div>
      ) : null}

      {tab === "sales" ? (
        <SalesTab report={sales} loading={loading} error={error} onRetry={() => void loadRange(applied)} />
      ) : null}
      {tab === "taxes" ? (
        <TaxesTab report={taxes} loading={loading} error={error} onRetry={() => void loadRange(applied)} />
      ) : null}
      {tab === "z" ? <ZTab /> : null}
    </section>
  );
}

// ---- Sales ----

function SalesTab(props: {
  report: SalesReport | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}) {
  if (props.error !== null) {
    return <ErrorNotice error={props.error} onRetry={props.onRetry} />;
  }
  if (props.loading || props.report === null) {
    return (
      <span className="loading-block">
        <span className="spinner" aria-hidden="true" /> Calculando reporte de ventas…
      </span>
    );
  }
  const report = props.report;
  return (
    <div className="report-stack">
      <p className="org-page__muted" style={{ margin: 0 }}>
        Del <strong>{report.range.from}</strong> al <strong>{report.range.to}</strong> ·{" "}
        {report.currency}
      </p>

      <Kpis
        items={[
          { label: "Ventas brutas", value: money(report.grossSales), tone: "ink" },
          { label: "Devoluciones", value: money(report.refundsTotal), tone: "danger" },
          { label: "Venta neta", value: money(report.netSales), tone: "success" },
          { label: "Ticket promedio", value: money(report.averageTicket), tone: "ink" },
          { label: "Tickets", value: String(report.salesCount), tone: "ink" },
          { label: "Canceladas", value: String(report.canceledCount), tone: "muted" },
        ]}
      />

      <div className="report-grid">
        <div className="card card--pad">
          <div className="card__title">Por día</div>
          {report.byDay.length === 0 ? (
            <p className="org-page__muted">Sin movimientos en el rango.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col" className="is-num">Tickets</th>
                  <th scope="col" className="is-num">Subtotal</th>
                  <th scope="col" className="is-num">Impuestos</th>
                  <th scope="col" className="is-num">Ventas</th>
                  <th scope="col" className="is-num">Devoluciones</th>
                </tr>
              </thead>
              <tbody>
                {report.byDay.map((day) => (
                  <tr key={day.date}>
                    <td>{dayLabel(day.date)}</td>
                    <td className="is-num">{day.salesCount}</td>
                    <td className="is-num">{money(day.subtotal)}</td>
                    <td className="is-num">{money(day.taxTotal)}</td>
                    <td className="is-num">{money(day.total)}</td>
                    <td className="is-num">{money(day.refunds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card card--pad">
          <div className="card__title">Formas de pago (ventas)</div>
          {report.byPaymentMethod.length === 0 ? (
            <p className="org-page__muted">Sin cobros en el rango.</p>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Método</th>
                  <th scope="col" className="is-num">Cobros</th>
                  <th scope="col" className="is-num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {report.byPaymentMethod.map((row) => (
                  <tr key={row.method}>
                    <td>{methodLabel(row.method)}</td>
                    <td className="is-num">{row.count}</td>
                    <td className="is-num">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="card__title" style={{ marginTop: "var(--space-6)" }}>
            Impuestos del periodo
          </div>
          <dl className="report-facts">
            <div>
              <dt>IEPS trasladado</dt>
              <dd>{money(report.iepsTotal)}</dd>
            </div>
            <div>
              <dt>IVA trasladado</dt>
              <dd>{money(report.ivaTotal)}</dd>
            </div>
            <div>
              <dt>Retenciones timbradas</dt>
              <dd>{money(report.withheldTotal)}</dd>
            </div>
            <div>
              <dt>Descuentos</dt>
              <dd>{money(report.discountTotal)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="card card--pad">
        <div className="card__title">Top productos por venta</div>
        {report.topProducts.length === 0 ? (
          <p className="org-page__muted">Sin productos vendidos en el rango.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">SKU</th>
                <th scope="col" className="is-num">Cantidad</th>
                <th scope="col" className="is-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {report.topProducts.map((row) => (
                <tr key={row.sku}>
                  <td>{row.productName}</td>
                  <td>{row.sku}</td>
                  <td className="is-num">{row.quantity}</td>
                  <td className="is-num">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="org-page__muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
          Las devoluciones se restan del neto y de los impuestos, pero no del
          ranking de productos vendidos.
        </p>
      </div>
    </div>
  );
}

// ---- Taxes ----

function TaxesTab(props: {
  report: TaxesReport | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
}) {
  if (props.error !== null) {
    return <ErrorNotice error={props.error} onRetry={props.onRetry} />;
  }
  if (props.loading || props.report === null) {
    return (
      <span className="loading-block">
        <span className="spinner" aria-hidden="true" /> Calculando impuestos…
      </span>
    );
  }
  const report = props.report;
  return (
    <div className="report-stack">
      <p className="org-page__muted" style={{ margin: 0 }}>
        Del <strong>{report.range.from}</strong> al <strong>{report.range.to}</strong> · neto
        de devoluciones · {report.currency}
      </p>

      <div className="report-grid">
        <div className="card card--pad">
          <div className="card__title">Traslados (IVA / IEPS)</div>
          <TaxTable rows={report.transferred} withBase />
          <div className="report-total">
            <span>Total trasladado</span>
            <strong>{money(report.transferredTotal)}</strong>
          </div>
        </div>

        <div className="card card--pad">
          <div className="card__title">Retenciones federales</div>
          <TaxTable rows={report.withheld} />
          <div className="report-total">
            <span>Total retenido</span>
            <strong>{money(report.withheldTotal)}</strong>
          </div>
          <p className="org-page__muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
            Retenciones de CFDI timbrados en el periodo (snapshot de la
            factura); una factura cancelada no cuenta.
          </p>
        </div>
      </div>
    </div>
  );
}

function TaxTable(props: { rows: readonly TaxRow[]; withBase?: boolean }) {
  if (props.rows.length === 0) {
    return <p className="org-page__muted">Sin registros en el rango.</p>;
  }
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th scope="col">Código</th>
          <th scope="col">Tipo</th>
          <th scope="col" className="is-num">Tasa</th>
          {props.withBase === true ? <th scope="col" className="is-num">Base</th> : null}
          <th scope="col" className="is-num">Importe</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={`${row.scheme}-${row.code}`}>
            <td>{row.code}</td>
            <td>{row.scheme}</td>
            <td className="is-num">{percent(row.rate)}</td>
            {props.withBase === true ? <td className="is-num">{money(row.base)}</td> : null}
            <td className="is-num">{money(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- Z corte ----

function ZTab() {
  const { activeTenantId } = useAuth();
  const [sessions, setSessions] = useState<readonly CashSessionView[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [report, setReport] = useState<ZReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listCashSessions();
      setSessions(list);
      setSessionId((current) => (current !== "" ? current : (list[0]?.id ?? "")));
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setLoading(false);
    }
  };

  const firstRun = useRef(true);
  const prevTenant = useRef(activeTenantId);
  useEffect(() => {
    if (!firstRun.current && prevTenant.current === activeTenantId) return;
    firstRun.current = false;
    prevTenant.current = activeTenantId;
    setSessionId("");
    setReport(null);
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const loadReport = async (id: string) => {
    if (id === "") return;
    setLoading(true);
    setError(null);
    try {
      setReport(await getZReport(id));
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId === "") {
      setReport(null);
      return;
    }
    void loadReport(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="report-stack">
      <div className="card card--pad no-print">
        <div className="report-filters">
          <label className="field">
            <span className="field__label">Turno de caja</span>
            <select
              className="input input--compact"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              disabled={loading || sessions.length === 0}
            >
              {sessions.length === 0 ? <option value="">Sin turnos</option> : null}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {when(session.openedAt)} · {session.status === "OPEN" ? "Abierta" : "Cerrada"} ·
                  ventas {session.salesCount}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void loadReport(sessionId)}
            disabled={loading || sessionId === ""}
          >
            {loading ? "Cargando…" : "Ver corte"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => window.print()}
            disabled={report === null}
          >
            Imprimir corte Z
          </button>
        </div>
      </div>

      {error !== null ? (
        <ErrorNotice error={error} onRetry={() => void loadSessions()} />
      ) : loading ? (
        <span className="loading-block">
          <span className="spinner" aria-hidden="true" /> Cargando corte…
        </span>
      ) : report === null ? (
        <p className="org-page__muted no-print">
          No hay turnos de caja en este tenant; abre una caja y cobra una venta
          para generar el primer corte.
        </p>
      ) : (
        <ZPrintable report={report} />
      )}
    </div>
  );
}

function ZPrintable({ report }: { report: ZReport }) {
  return (
    <div className="z-print">
      <div className="z-print__head">
        <div>
          <div className="z-print__kicker">Corte Z · turno de caja</div>
          <h2 className="z-print__title">
            {when(report.openedAt)} → {report.closedAt === null ? "abierto" : when(report.closedAt)}
          </h2>
        </div>
        <Badge tone={report.status === "OPEN" ? "success" : "neutral"}>
          {report.status === "OPEN" ? "En curso" : "Cerrado"}
        </Badge>
      </div>

      <Kpis
        items={[
          { label: "Ventas brutas", value: money(report.grossSales), tone: "ink" },
          { label: "Devoluciones", value: money(report.refundsTotal), tone: "danger" },
          { label: "Venta neta", value: money(report.netSales), tone: "success" },
          { label: "Tickets", value: String(report.salesCount), tone: "ink" },
          { label: "Impuestos", value: money(report.taxTotal), tone: "ink" },
          { label: "Retenciones", value: money(report.withheldTotal), tone: "muted" },
        ]}
      />

      <div className="report-grid">
        <div className="card card--pad">
          <div className="card__title">Cobros del turno</div>
          <MethodTable rows={report.byPaymentMethod} />
        </div>

        <div className="card card--pad">
          <div className="card__title">Cajón (solo efectivo)</div>
          <dl className="report-facts">
            <div>
              <dt>Fondo inicial</dt>
              <dd>{money(report.openingFloat)}</dd>
            </div>
            <div>
              <dt>Efectivo cobrado</dt>
              <dd>{money(report.cashSales)}</dd>
            </div>
            <div>
              <dt>Efectivo devuelto</dt>
              <dd>{money(report.cashRefunds)}</dd>
            </div>
            <div>
              <dt>Esperado</dt>
              <dd>{money(report.expectedCash)}</dd>
            </div>
            <div>
              <dt>Contado</dt>
              <dd>{money(report.countedCash)}</dd>
            </div>
            <div>
              <dt>Diferencia</dt>
              <dd>{money(report.difference)}</dd>
            </div>
          </dl>
          {report.closeNote !== null ? (
            <p className="org-page__muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              Nota de cierre: {report.closeNote}
            </p>
          ) : null}
        </div>
      </div>

      <div className="card card--pad">
        <div className="card__title">Tickets del turno</div>
        {report.sales.length === 0 ? (
          <p className="org-page__muted">Sin ventas adjuntas a este turno.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Hora</th>
                <th scope="col">Estado</th>
                <th scope="col">Pago</th>
                <th scope="col" className="is-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.sales.map((sale) => (
                <tr key={sale.folio}>
                  <td>#{sale.folio}</td>
                  <td>{when(sale.createdAt)}</td>
                  <td>
                    <Badge tone={sale.status === "COMPLETED" ? "success" : "danger"}>
                      {sale.status === "COMPLETED" ? "Completada" : "Cancelada"}
                    </Badge>
                  </td>
                  <td>
                    {sale.paymentMethods === null
                      ? "—"
                      : sale.paymentMethods.split(",").map(methodLabel).join(" · ")}
                  </td>
                  <td className="is-num">{money(sale.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="org-page__muted" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
          Se listan hasta 200 tickets; los totales del corte incluyen TODOS los
          del turno.
        </p>
      </div>
    </div>
  );
}

function MethodTable({ rows }: { rows: readonly MethodRow[] }) {
  if (rows.length === 0) {
    return <p className="org-page__muted">Sin cobros en el turno.</p>;
  }
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th scope="col">Método</th>
          <th scope="col" className="is-num">Cobros</th>
          <th scope="col" className="is-num">Monto</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.method}>
            <td>{methodLabel(row.method)}</td>
            <td className="is-num">{row.count}</td>
            <td className="is-num">{money(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Kpis({
  items,
}: {
  items: readonly { label: string; value: string; tone: "ink" | "success" | "danger" | "muted" }[];
}) {
  return (
    <div className="report-kpis">
      {items.map((item) => (
        <div className="report-kpi" key={item.label} data-tone={item.tone}>
          <span className="report-kpi__label">{item.label}</span>
          <span className="report-kpi__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
