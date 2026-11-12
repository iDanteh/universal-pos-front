import { getSystemStatus, type SystemStatus } from "@/api/system";
import { useApiResource } from "@/hooks/useApiResource";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

function statusTone(status: string): "success" | "danger" {
  return status === "UP" ? "success" : "danger";
}

function StatusDot({ tone }: { tone: "success" | "danger" }) {
  return (
    <span
      className={`status-dot status-dot--${tone === "success" ? "ok status-dot--pulse" : "bad"}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton that mirrors the real KPI layout (no generic spinner). */
function DashboardSkeleton() {
  return (
    <div className="cards-grid" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton" style={{ height: 10, width: "45%" }} />
          <div className="skeleton" style={{ height: 26, width: "65%" }} />
          <div className="skeleton" style={{ height: 16, width: "38%" }} />
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data, loading, error, reload } = useApiResource<SystemStatus>(getSystemStatus);

  return (
    <section aria-labelledby="dashboard-title">
      <div className="page-header">
        <h1 id="dashboard-title">Estado de la plataforma</h1>
        <p>
          Foundation v0.9.0: identidad con sesiones reales, aislamiento
          multi-tenant, giro declarativo, catálogo, ventas con folios e
          idempotencia, inventario con lotes FEFO, facturación CFDI 4.0
          (individual + global mensual), caja con turnos y reconciliación,
          impuestos IVA/IEPS con snapshot por línea, y ahora devoluciones
          parciales con notas de crédito CFDI tipo E fiscal-aware.
        </p>
      </div>

      {loading ? <DashboardSkeleton /> : null}
      {error ? <ErrorNotice error={error} onRetry={reload} /> : null}

      {data ? (
        <div className="cards-grid">
          <div className="card card--pad kpi">
            <span className="kpi__label">Estado del sistema</span>
            <span className="kpi__value">
              <StatusDot tone={statusTone(data.status)} />
              {data.status}
            </span>
            <span className="kpi__meta">
              {data.status === "UP" ? "servicios operativos" : "revisar infraestructura"}
            </span>
            <span style={{ marginTop: "var(--space-2)" }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={reload}>
                Reintentar
              </button>
            </span>
          </div>

          <div className="card card--pad kpi">
            <span className="kpi__label">Base de datos</span>
            <span className="kpi__value">
              <StatusDot tone={data.database === "up" ? "success" : "danger"} />
              PostgreSQL
            </span>
            <span className="kpi__meta">
              {data.database === "up" ? "conectada · RLS activo" : "no disponible"}
            </span>
          </div>

          <div className="card card--pad kpi">
            <span className="kpi__label">Versión</span>
            <span className="kpi__value">{data.version}</span>
            <span className="kpi__meta">{data.application}</span>
          </div>
        </div>
      ) : null}

      <div className="card card--pad" style={{ marginTop: "var(--space-6)" }}>
        <div className="card__title">Siguientes pasos del producto</div>
        <ol className="data-list">
          <li><span className="data-list__index">01</span>Devoluciones y notas de crédito fiscales (reproducen los impuestos de la venta original)</li>
          <li><span className="data-list__index">02</span>POS offline-first con sincronización (ADR-005)</li>
          <li><span className="data-list__index">03</span>Gestión de usuarios e invitaciones</li>
          <li><span className="data-list__index">04</span>Cadena multi-impuesto IEPS→IVA por línea y retenciones</li>
        </ol>
      </div>
    </section>
  );
}
