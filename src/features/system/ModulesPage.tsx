import { ModuleStatusBadge } from "@/components/ui/Badge";

type ModuleStatus = "implemented" | "documented" | "planned";

interface ModuleRow {
  name: string;
  description: string;
  status: ModuleStatus;
  note?: string;
}

/**
 * Roadmap data mirrors the architecture docs (docs/architecture).
 * Keep in sync with README's status table.
 */
const MODULES: readonly ModuleRow[] = [
  {
    name: "Identity & Access",
    description: "Usuarios globales, membresías, roles y permisos (modelo persistido; autenticación real v0.2).",
    status: "documented",
    note: "Modelo + roles base implementados",
  },
  {
    name: "Organization",
    description: "Organizaciones, razones sociales y sucursales con integridad multi-tenant.",
    status: "implemented",
  },
  {
    name: "Branding (White Label)",
    description: "Marcas, distribuidores y relaciones organización-marca declarativas.",
    status: "documented",
  },
  {
    name: "Subscriptions",
    description: "Planes y suscripciones; activation trial en onboarding.",
    status: "documented",
  },
  {
    name: "Catalog / Pricing",
    description: "Productos, variantes, SKUs, parámetros por giro, precios NUMERIC string (v0.3 · ADR-013).",
    status: "implemented",
    note: "API REST + página /catalogo",
  },
  {
    name: "Inventory",
    description: "Almacenes, balances, movimientos inmutables, lotes y FEFO (v0.5 · ADR-004/010/015).",
    status: "implemented",
    note: "Núcleo implementado — API REST + página /inventario",
  },
  {
    name: "Sales / Payments",
    description: "Ventas con snapshot de precios, pagos exactos, folios e idempotencia (v0.4 · ADR-014); adjuntadas al turno de caja activo (v0.7).",
    status: "implemented",
    note: "Núcleo implementado — API REST + página /ventas",
  },
  {
    name: "Cash Register",
    description: "Sesiones de caja con fondo inicial, cierre con conteo por método y reconciliación de efectivo menos los reembolsos del turno (v0.7 · ADR-017 + v0.9 · ADR-019).",
    status: "implemented",
    note: "Núcleo implementado — API REST + página /caja",
  },
  {
    name: "Purchasing / Customers",
    description: "Proveedores, órdenes de compra, recepción de mercancía, clientes.",
    status: "planned",
  },
  {
    name: "Fiscal (CFDI 4.0)",
    description: "Emisión CFDI 4.0 con PAC simulado, factura global mensual y cancelaciones SAT (v0.6 · ADR-006/016).",
    status: "implemented",
    note: "Núcleo implementado — API REST + página /facturacion",
  },
  {
    name: "Tax (IVA/IEPS)",
    description: "Tasas de impuesto globales en migraciones, asignación por SKU con snapshot por línea en venta y CFDI (v0.8 · ADR-018).",
    status: "implemented",
    note: "Núcleo implementado — catálogo de tasas + impuestos en ventas/facturación",
  },
  {
    name: "Returns / Credit Notes",
    description: "Devoluciones parciales con stock de vuelta y notas de crédito CFDI tipo E que reproducen 1:1 los impuestos cobrados (v0.9 · ADR-019).",
    status: "implemented",
    note: "Núcleo implementado — devolver / Emitir NC en /ventas",
  },
  {
    name: "Synchronization (offline-first)",
    description: "Cola local del POS, lotes, acks y resolución de conflictos (ADR-005).",
    status: "planned",
  },
  {
    name: "Audit / Reporting",
    description: "Registro de auditoría y reportes de negocio.",
    status: "planned",
  },
];

export function ModulesPage() {
  return (
    <section aria-labelledby="modules-title">
      <div className="page-header">
        <h1 id="modules-title">Módulos de la plataforma</h1>
        <p>
          Estado del roadmap de Foundation v0.9.0. La sesión y el shell ya
          operan; los módulos “documentados” tienen modelo de datos y
          decisiones de arquitectura; los “planeados” esperan entregas futuras.
        </p>
      </div>

      <div className="card">
        {MODULES.map((m) => (
          <div className="module-row" key={m.name}>
            <div>
              <div className="module-row__head">
                <h3>{m.name}</h3>
                <ModuleStatusBadge status={m.status} />
                {m.note ? <span className="badge badge--neutral">{m.note}</span> : null}
              </div>
              <p className="module-row__desc">{m.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
