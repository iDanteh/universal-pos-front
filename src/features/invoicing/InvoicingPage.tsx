import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import { listSales, type SaleView } from "@/api/sales";
import {
  cancelInvoice,
  issueGlobalInvoice,
  issueInvoice,
  listCatalog,
  listEmisores,
  listInvoices,
  saveEmisor,
  type CatalogItem,
  type EmisorView,
  type InvoiceView,
} from "@/api/invoicing";

/** Display-only money formatting of backend NUMERIC strings (never floats). */
function money(value: string): string {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return value;
  return amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function when(value: string): string {
  return new Date(value).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// Selected SAT catalogs (the backend validates against DB sat_catalog anyway).
const CANCEL_MOTIVES: readonly CatalogItem[] = [
  { code: "01", description: "Con errores, con relación" },
  { code: "02", description: "Con errores, sin relación" },
  { code: "03", description: "No se llevó a cabo la operación" },
];

/** Invoice status chips: semantic colors for instant list scanning. */
const INVOICE_STATUS: Readonly<
  Record<string, { tone: "success" | "danger" | "warning" }>
> = {
  STAMPED: { tone: "success" },
  CANCELED: { tone: "danger" },
  PENDING: { tone: "warning" },
  ERROR: { tone: "danger" },
};

/**
 * FACTURACIÓN page (fase 6 · ADR-006/016): the razón social's fiscal face
 * (emisor), CFDI 4.0 emission from completed sales (individual with measured
 * receptor + monthly global to the RFC genérico) and the document list with
 * SAT-motive cancellation. The backend owns every rule; the UI mirrors its
 * vocabulary: sat_catalog codes are OPTIONS of what the backend seeded.
 */
export function InvoicingPage() {
  const { activeTenantId } = useAuth();
  const emisoresRes = useApiResource<readonly EmisorView[]>(listEmisores);
  const invoicesRes = useApiResource<readonly InvoiceView[]>(listInvoices);
  const salesRes = useApiResource<readonly SaleView[]>(listSales);
  const regimesRes = useApiResource<readonly CatalogItem[]>(() => listCatalog("REGIMEN"));
  const usosRes = useApiResource<readonly CatalogItem[]>(() => listCatalog("USO_CFDI"));
  const motivosRes = useApiResource<readonly CatalogItem[]>(() =>
    listCatalog("MOTIVO_CANCELACION"),
  );

  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    emisoresRes.reload();
    invoicesRes.reload();
    salesRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const emisores = emisoresRes.data ?? [];
  const completeEmisores = emisores.filter((e) => e.rfc !== null && e.rfc !== "");
  /** The emisor used by issue flows (first razón social with a complete face). */
  const emisorFactura = completeEmisores[0];

  const refresh = () => {
    invoicesRes.reload();
    salesRes.reload();
  };

  const catalogError = regimesRes.error ?? usosRes.error ?? motivosRes.error ?? null;

  // Completed sales WITHOUT an active invoice (issueable candidates).
  const uninvoiced = (salesRes.data ?? []).filter(
    (sale) =>
      sale.status === "COMPLETED" &&
      !(invoicesRes.data ?? []).some(
        (invoice) =>
          invoice.saleId !== null &&
          invoice.saleId === sale.id &&
          (invoice.status === "STAMPED" || invoice.status === "PENDING"),
      ),
  );

  return (
    <section aria-labelledby="invoicing-title">
      <div className="page-header">
        <h1 id="invoicing-title">Facturación</h1>
        <p>
          CFDI 4.0 sobre ventas completadas (PAC simulado de esta fase):
          completa la cara fiscal del emisor, factura ventas con datos del
          receptor, emite la factura global del mes y cancela con motivo SAT.
          El CFDI es un snapshot de la venta: jamás factura un monto distinto
          al pagado.
        </p>
      </div>

      {catalogError !== null ? (
        <ErrorNotice
          error={catalogError}
          onRetry={() => {
            regimesRes.reload();
            usosRes.reload();
            motivosRes.reload();
          }}
        />
      ) : emisoresRes.error !== null ? (
        <ErrorNotice error={emisoresRes.error} onRetry={emisoresRes.reload} />
      ) : null}

      <div className="org-grid">
        <div className="card card--pad">
          <div className="card__title">Emisor (razón social)</div>
          {emisoresRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando emisor…
            </span>
          ) : emisores.length === 0 ? (
            <p className="org-page__muted">
              La organización no tiene razones sociales registradas.
            </p>
          ) : (
            <EmisorForm
              emisor={firstNonCompleteOrFirst(emisores)}
              canChoose={emisores.length > 1}
              regimes={regimesRes.data ?? []}
              onSaved={emisoresRes.reload}
            />
          )}
          {completeEmisores.length > 1 ? (
            <p className="org-page__muted" style={{ margin: "var(--space-2) 0 0" }}>
              {completeEmisores.length} razones sociales listas para facturar;
              esta fase emite con la primera (proximas fases: selector por
              motivo legal).
            </p>
          ) : null}
        </div>

        <div className="card card--pad org-grid__wide">
          <div className="card__title">Ventas sin factura</div>
          {salesRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando ventas…
            </span>
          ) : salesRes.error !== null ? (
            <ErrorNotice error={salesRes.error} onRetry={salesRes.reload} />
          ) : uninvoiced.length === 0 ? (
            <p className="org-page__muted">
              Sin ventas pendientes de facturar. Las ventas completadas (POS o
              API) aparecen aquí inmediatamente.
            </p>
          ) : completeEmisores.length === 0 ? (
            <>
              <p className="org-page__muted">
                {uninvoiced.length} venta(s) lista(s), pero el emisor fiscal no
                está completo todavía.
              </p>
              <p className="org-page__muted">
                Completa RFC, régimen fiscal y código postal en la tarjeta
                "Emisor" para habilitar la facturación.
              </p>
            </>
          ) : (regimesRes.data ?? []).length === 0 || (usosRes.data ?? []).length === 0 ? (
            <p className="org-page__muted">Cargando catálogos SAT…</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {uninvoiced.slice(0, 10).map((sale) => (
                <IssueCard
                  key={sale.id}
                  sale={sale}
                  legalEntityId={emisorFactura?.id}
                  regimes={regimesRes.data ?? []}
                  usos={usosRes.data ?? []}
                  onDone={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="org-grid" style={{ marginTop: "var(--space-4)" }}>
        <div className="card card--pad">
          <GlobalInvoiceCard legalEntityId={emisorFactura?.id} onDone={refresh} />
        </div>

        <div className="card card--pad org-grid__wide">
          <div className="card__title">Facturas recientes</div>
          {invoicesRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando facturas…
            </span>
          ) : invoicesRes.error !== null ? (
            <ErrorNotice error={invoicesRes.error} onRetry={invoicesRes.reload} />
          ) : (invoicesRes.data ?? []).length === 0 ? (
            <p className="org-page__muted">Sin facturas todavía.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              {(invoicesRes.data ?? []).map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  motiveList={
                    motivosRes.data !== null && motivosRes.data.length > 0
                      ? motivosRes.data
                      : CANCEL_MOTIVES
                  }
                  onDone={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function firstNonCompleteOrFirst(emisores: readonly EmisorView[]): EmisorView {
  const incomplete = emisores.find(
    (e) => e.rfc === null || e.rfc === "" || e.fiscalRegime === null || e.zipCode === null,
  );
  return incomplete ?? (emisores[0] as EmisorView);
}

// ---- Emisor fiscal face (ADR-006 rule 1) ----

function EmisorForm({
  emisor,
  canChoose,
  regimes,
  onSaved,
}: {
  emisor: EmisorView | undefined;
  canChoose: boolean;
  regimes: readonly CatalogItem[];
  onSaved: () => void;
}) {
  const rfcLocked = emisor !== undefined && emisor.rfc !== null && emisor.rfc !== "";
  const [rfc, setRfc] = useState("");
  const [regime, setRegime] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (emisor === undefined) return;
    setRegime(emisor.fiscalRegime ?? "");
    setZip(emisor.zipCode ?? "");
    setRfc("");
  }, [emisor?.id]);

  if (emisor === undefined) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (emisor === undefined) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveEmisor({
        legalEntityId: emisor.id,
        taxId: rfcLocked ? emisor.rfc ?? "" : `${rfc}`,
        fiscalRegime: regime,
        zipCode: zip,
      });
      setSuccess(
        saved.complete
          ? `Emisor ${saved.legalName} listo para facturar.`
          : "Emisor guardado (incompleto).",
      );
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="org-page__muted" style={{ marginTop: 0 }}>
        <strong>{emisor.legalName}</strong>
        {emisor.tradeName !== null && emisor.tradeName !== "" ? (
          <> — {emisor.tradeName}</>
        ) : null}
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)" }}>
        <div className="field">
          <label className="field__label" htmlFor="emisor-rfc">
            RFC {rfcLocked ? "(asignado)" : "*"}
          </label>
          {rfcLocked ? (
            <input id="emisor-rfc" className="input" value={emisor.rfc ?? ""} readOnly disabled />
          ) : (
            <input
              id="emisor-rfc"
              className="input"
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              placeholder="GME800410HM2"
              maxLength={13}
              required
            />
          )}
          {!rfcLocked ? (
            <p className="org-page__muted" style={{ margin: "var(--space-1) 0 0" }}>
              Se asigna UNA VEZ y queda fijo: el RFC del emisor no se edita
              desde este panel (cambiarlo es un caso de uso aparte).
            </p>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="emisor-regime">Régimen fiscal SAT *</label>
          <select
            id="emisor-regime"
            className="input"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            required
          >
            <option value="">— régimen —</option>
            {regimes.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.description}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="emisor-zip">Código postal (LugarExpedicion) *</label>
          <input
            id="emisor-zip"
            className="input"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="03100"
            inputMode="numeric"
            maxLength={5}
            required
          />
        </div>
        {error !== null ? (
          <p className="org-page__form-error" role="alert">{error.userMessage}</p>
        ) : null}
        {success !== null ? <p className="org-page__form-success">{success}</p> : null}
        <div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar datos del emisor"}
          </button>
          {canChoose ? (
            <span className="org-page__muted" style={{ marginLeft: "var(--space-2)" }}>
              Hay varias razones sociales; se edita la pendiente de completar.
            </span>
          ) : null}
        </div>
      </form>
    </>
  );
}

// ---- Individual issue (receptor form) ----

function IssueCard({
  sale,
  legalEntityId,
  regimes,
  usos,
  onDone,
}: {
  sale: SaleView;
  legalEntityId: string | undefined;
  regimes: readonly CatalogItem[];
  usos: readonly CatalogItem[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {sale.lines.length > 0 ? <strong>{sale.lines[0]?.productName}</strong> : null}
        {sale.lines.length > 1 ? (
          <span className="org-page__muted">+{sale.lines.length - 1} más</span>
        ) : null}
        <span className="org-page__muted">{when(sale.createdAt)}</span>
        <span style={{ fontWeight: 600 }}>${money(sale.total)}</span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Facturar"}
        </button>
      </div>
      {open ? (
        <ReceptorForm saleId={sale.id} total={sale.total} legalEntityId={legalEntityId} regimes={regimes} usos={usos} onDone={onDone} />
      ) : null}
    </div>
  );
}

function ReceptorForm({
  saleId,
  total,
  legalEntityId,
  regimes,
  usos,
  onDone,
}: {
  saleId: string;
  total: string;
  legalEntityId: string | undefined;
  regimes: readonly CatalogItem[];
  usos: readonly CatalogItem[];
  onDone: () => void;
}) {
  const [rfc, setRfc] = useState("");
  const [name, setName] = useState("");
  const [regime, setRegime] = useState("601");
  const [uso, setUso] = useState("G01");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const invoice = await issueInvoice({
        saleId,
        ...(legalEntityId !== undefined ? { legalEntityId } : {}),
        receptor: { rfc: rfc.trim().toUpperCase(), name: name.trim(), regime, use: uso, zip: zip.trim() },
      });
      setSuccess(
        `CFDI ${invoice.folioLabel} TIMBRADO (PAC simulado · folio fiscal ${invoice.fiscalId?.slice(0, 8) ?? "?"}…).`,
      );
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <p className="org-page__muted" style={{ margin: 0 }}>
        Importe a facturar: <strong>${money(total)}</strong> (snapshot de la venta: no
        editable).
      </p>
      <div className="org-form-grid">
        <div className="field">
          <label className="field__label" htmlFor={`rfc-${saleId}`}>RFC receptor *</label>
          <input
            id={`rfc-${saleId}`}
            className="input"
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            placeholder="GME800410HM2"
            maxLength={13}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`name-${saleId}`}>Nombre del receptor *</label>
          <input
            id={`name-${saleId}`}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cliente SA de CV"
            maxLength={180}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`regime-${saleId}`}>Régimen SAT *</label>
          <select
            id={`regime-${saleId}`}
            className="input"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
            required
          >
            {regimes.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.description}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`uso-${saleId}`}>Uso CFDI *</label>
          <select
            id={`uso-${saleId}`}
            className="input"
            value={uso}
            onChange={(e) => setUso(e.target.value)}
            required
          >
            {usos.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.description}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`zip-${saleId}`}>CP del receptor *</label>
          <input
            id={`zip-${saleId}`}
            className="input"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="06600"
            inputMode="numeric"
            maxLength={5}
            required
          />
        </div>
      </div>
      {error !== null ? (
        <p className="org-page__form-error" role="alert">{error.userMessage}</p>
      ) : null}
      {success !== null ? <p className="org-page__form-success">{success}</p> : null}
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Timbrando…" : "Emitir CFDI"}
        </button>
      </div>
    </form>
  );
}

// ---- Global monthly invoice ----

function GlobalInvoiceCard({ legalEntityId, onDone }: { legalEntityId: string | undefined; onDone: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const invoice = await issueGlobalInvoice({
        periodYear: Number.parseInt(year, 10),
        periodMonth: Number.parseInt(month, 10),
        ...(legalEntityId !== undefined ? { legalEntityId } : {}),
      });
      setSuccess(`Factura global ${invoice.folioLabel} emitida.`);
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card__title">Factura global del mes</div>
      <p className="org-page__muted">
        Consolida TODAS las ventas del mes que aún no tengan factura activa,
        a nombre de "PÚBLICO EN GENERAL" (RFC genérico XAXX010101000),
        agregando conceptos repetidos. Una global activa por periodo.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)" }}>
        <div className="org-form-grid">
          <div className="field">
            <label className="field__label" htmlFor="global-year">Año</label>
            <input
              id="global-year"
              className="input"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="global-month">Mes</label>
            <select
              id="global-month"
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {new Date(2000, m - 1).toLocaleDateString("es-MX", { month: "long" })}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error !== null ? (
          <p className="org-page__form-error" role="alert">{error.userMessage}</p>
        ) : null}
        {success !== null ? <p className="org-page__form-success">{success}</p> : null}
        <div>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Emitiendo…" : "Emitir factura global"}
          </button>
        </div>
      </form>
    </>
  );
}

// ---- Invoice list row + cancellation ----

function InvoiceRow({
  invoice,
  motiveList,
  onDone,
}: {
  invoice: InvoiceView;
  motiveList: readonly CatalogItem[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const statusLabel =
    invoice.status === "STAMPED"
      ? "TIMBRADA"
      : invoice.status === "CANCELED"
        ? "CANCELADA"
        : invoice.status;
  const statusTone = INVOICE_STATUS[invoice.status]?.tone ?? "neutral";

  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        <strong>{invoice.folioLabel}</strong>
        <span className="org-page__code">{invoice.kind}</span>
        <span>{invoice.receptorRfc}</span>
        <span style={{ fontWeight: 600 }}>${money(invoice.total)}</span>
        <span className="org-page__muted">
          {invoice.periodYear !== null
            ? `${invoice.periodYear}-${String(invoice.periodMonth ?? 0).padStart(2, "0")} · `
            : ""}
          {when(invoice.createdAt)}
        </span>
        {invoice.status === "STAMPED" ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Cerrar" : "Cancelar"}
          </button>
        ) : null}
      </div>
      {invoice.status === "CANCELED" && invoice.cancelMotive !== null ? (
        <p className="org-page__muted" style={{ margin: 0 }}>
          Cancelada con motivo SAT {invoice.cancelMotive}
          {invoice.cancelNote !== null ? ` — ${invoice.cancelNote}` : ""}
        </p>
      ) : null}
      {open ? (
        <CancelForm
          invoiceId={invoice.id}
          motiveList={motiveList}
          onDone={() => {
            setOpen(false);
            onDone();
          }}
        />
      ) : null}
    </div>
  );
}

function CancelForm({
  invoiceId,
  motiveList,
  onDone,
}: {
  invoiceId: string;
  motiveList: readonly CatalogItem[];
  onDone: () => void;
}) {
  const [motive, setMotive] = useState("01");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const canceled = await cancelInvoice({ invoiceId, motive, note: note.trim() });
      setSuccess(`CFDI ${canceled.folioLabel} cancelado con motivo ${motive}.`);
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <div className="org-form-grid">
        <div className="field">
          <label className="field__label" htmlFor={`motive-${invoiceId}`}>Motivo SAT *</label>
          <select
            id={`motive-${invoiceId}`}
            className="input"
            value={motive}
            onChange={(e) => setMotive(e.target.value)}
          >
            {motiveList.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.description}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`note-${invoiceId}`}>Nota</label>
          <input
            id={`note-${invoiceId}`}
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Errores de captura del RFC"
            maxLength={280}
          />
        </div>
      </div>
      {error !== null ? (
        <p className="org-page__form-error" role="alert">{error.userMessage}</p>
      ) : null}
      {success !== null ? <p className="org-page__form-success">{success}</p> : null}
      <div>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Cancelando…" : "Cancelar CFDI"}
        </button>
        <span className="org-page__muted" style={{ marginLeft: "var(--space-2)" }}>
          Una vez cancelada, la venta vuelve a ser facturable (nuevo CFDI).
        </span>
      </div>
    </form>
  );
}
