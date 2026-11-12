import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import {
  closeCashSession,
  listCashSessions,
  openCashSession,
  type CloseSessionCommand,
  type CashSessionView,
} from "@/api/cash";

/**
 * CAJA page (fase 7 · ADR-017): the drawer in the admin console. ONE session
 * OPEN per tenant (backend-enforced): open with a physical float, collect
 * sales (they attach automatically) and CASH refunds of devoluciones (they
 * leave the drawer), and close with a per-method count — the backend
 * reconciles CASH-ONLY: difference = counted − (float + cash sales − cash
 * refunds, v0.9 · ADR-019). The UI pre-fills the cash count with the
 * theoretical total and previews the difference live (short/over drawer),
 * but the REAL numbers are always the backend's — same "SOLO PANTALLA" rule
 * as the sales calculator.
 */

const money = (value: number): string =>
  value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const when = (iso: string): string =>
  new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

const COUNT_FIELDS: readonly { key: keyof CloseSessionCommand; label: string }[] = [
  { key: "countedCash", label: "Efectivo contado" },
  { key: "countedCard", label: "Tarjeta" },
  { key: "countedTransfer", label: "Transferencia" },
  { key: "countedOther", label: "Otros" },
];

export function CashPage() {
  const { activeTenantId } = useAuth();

  const [current, setCurrent] = useState<CashSessionView | null>(null);
  const [history, setHistory] = useState<readonly CashSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<ApiError | null>(null);

  const [openingFloat, setOpeningFloat] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const sessions = await listCashSessions();
      setHistory(sessions);
      // The open drawer rides in the list (at most ONE per tenant — V14
      // partial index). Deriving it from /current would log a harmless 404;
      // the endpoint stays for API clients that want the explicit probe.
      const active = sessions.find((s) => s.status === "OPEN") ?? null;
      setCurrent(active);
      // Prefill the CASH count with the theoretical drawer total (editable):
      // float + CASH sales MINUS CASH refunds paid back (v0.9 · ADR-019).
      if (active !== null) {
        const expected =
          Number.parseFloat(active.openingFloat || "0") +
          Number.parseFloat(active.cashTotal || "0") -
          Number.parseFloat(active.cashRefunds || "0");
        setCounts((prev) => ({
          ...prev,
          countedCash: prev.countedCash ?? expected.toFixed(2),
        }));
      }
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setLoading(false);
    }
  };

  // First load + every tenant switch refetches (the drawer is per tenant).
  const firstRun = useRef(true);
  const prevTenant = useRef(activeTenantId);
  useEffect(() => {
    if (!firstRun.current && prevTenant.current === activeTenantId) return;
    firstRun.current = false;
    prevTenant.current = activeTenantId;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const resetForm = () => {
    setCounts({});
    setNote("");
  };

  const submitOpen = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const opened = await openCashSession(openingFloat === "" ? "0.00" : openingFloat);
      setOpeningFloat("");
      setSuccess(`Caja abierta con fondo de $${money(Number.parseFloat(opened.openingFloat))}.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitClose = async (event: FormEvent) => {
    event.preventDefault();
    if (current === null) return;
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const countedCash = counts.countedCash ?? "0.00";
      const closed = await closeCashSession(current.id, {
        countedCash,
        ...(counts.countedCard !== undefined && counts.countedCard !== ""
          ? { countedCard: counts.countedCard }
          : {}),
        ...(counts.countedTransfer !== undefined && counts.countedTransfer !== ""
          ? { countedTransfer: counts.countedTransfer }
          : {}),
        ...(counts.countedOther !== undefined && counts.countedOther !== ""
          ? { countedOther: counts.countedOther }
          : {}),
        ...(note === "" ? {} : { note }),
      });
      const diff = closed.difference ?? "0.00";
      const diffNum = Number.parseFloat(diff);
      setSuccess(
        `Caja cerrada · esperado $${money(Number.parseFloat(closed.expectedCash ?? "0"))}, contado ` +
          `$${money(Number.parseFloat(closed.countedCash ?? "0"))} · ` +
          (diffNum === 0 ? "cuadrada" : diffNum > 0 ? `sobrante ${diff}` : `faltante ${diff}`) +
          ".",
      );
      resetForm();
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  // SOLO PANTALLA: the real reconciliation belongs to the backend at close.
  // The theoretical drawer is float + CASH sales − CASH refunds (fase 9).
  const theoretical =
    current === null
      ? 0
      : Number.parseFloat(current.openingFloat || "0") +
        Number.parseFloat(current.cashTotal || "0") -
        Number.parseFloat(current.cashRefunds || "0");
  const countedNum =
    current === null || counts.countedCash === undefined || counts.countedCash === ""
      ? null
      : Number.parseFloat(counts.countedCash);
  const previewDiff = countedNum === null ? null : Math.round((countedNum - theoretical) * 100) / 100;

  return (
    <section aria-labelledby="cash-title">
      <div className="page-header">
        <h1 id="cash-title">Caja</h1>
        <p>
          El cajón de efectivo de la organización: abre el turno con un fondo,
          las ventas cobradas se adjuntan solas, los reembolsos en efectivo de
          las devoluciones salen del cajón y al cerrar reconcilia el conteo
          contra lo esperado (fondo + efectivo − reembolsos).
        </p>
      </div>

      {error !== null ? <ErrorNotice error={error} onRetry={load} /> : null}
      {success !== null ? <p className="org-page__form-success">{success}</p> : null}

      <div className="org-grid">
        <div className="card card--pad">
          {loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando caja…
            </span>
          ) : current === null ? (
            <OpenForm
              busy={busy}
              openingFloat={openingFloat}
              error={formError}
              onOpeningFloat={setOpeningFloat}
              onSubmit={submitOpen}
            />
          ) : (
            <CloseForm
              busy={busy}
              current={current}
              counts={counts}
              note={note}
              error={formError}
              theoretical={theoretical}
              previewDiff={previewDiff}
              onCounts={(key, value) => setCounts((prev) => ({ ...prev, [key]: value }))}
              onNote={setNote}
              onSubmit={submitClose}
            />
          )}
        </div>

        <div className="card card--pad org-grid__wide">
          <div className="card__title">Historial de cajas</div>
          {loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando historial…
            </span>
          ) : history.length === 0 ? (
            <p className="org-page__muted">Aún no hay turnos de caja. Abre el primero a la izquierda.</p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {history.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- Open form (no drawer active) ----

function OpenForm(props: {
  busy: boolean;
  openingFloat: string;
  error: ApiError | null;
  onOpeningFloat: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} style={{ display: "grid", gap: "var(--space-3)" }}>
      <div className="card__title">Abrir caja</div>
      <p className="org-page__muted" style={{ margin: 0 }}>
        No hay ninguna sesión de caja abierta. Cuenta el fondo del cajón antes
        de empezar a cobrar; cada venta del turno se adjuntará a esta caja.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="opening-float">
          Fondo inicial
        </label>
        <input
          className="input"
          id="opening-float"
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={props.openingFloat}
          onChange={(e) => props.onOpeningFloat(e.target.value)}
        />
      </div>
      {props.error !== null ? <ErrorNotice error={props.error} onRetry={() => undefined} /> : null}
      <div>
        <button
          type="submit"
          className="btn btn--primary btn--charge"
          disabled={props.busy}
        >
          {props.busy ? "Abriendo…" : "Abrir caja"}
        </button>
      </div>
    </form>
  );
}

// ---- Close form (drawer active) ----

function CloseForm(props: {
  busy: boolean;
  current: CashSessionView;
  counts: Record<string, string>;
  note: string;
  error: ApiError | null;
  theoretical: number;
  previewDiff: number | null;
  onCounts: (key: string, value: string) => void;
  onNote: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { current } = props;
  return (
    <form onSubmit={props.onSubmit} style={{ display: "grid", gap: "var(--space-3)" }}>
      <div className="card__title">Cerrar caja</div>

      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "baseline", flexWrap: "wrap" }}>
        <Badge tone="success">Abierta</Badge>
        <span className="org-page__muted">desde {when(current.openedAt)}</span>
      </div>
      <p className="org-page__muted" style={{ margin: 0 }}>
        Fondo ${money(Number.parseFloat(current.openingFloat))} · ventas del turno {current.salesCount} ·
        reembolsos {current.refundsCount} (−${money(Number.parseFloat(current.cashRefunds || "0"))}) ·
        efectivo contable ${money(props.theoretical)}
      </p>

      <div className="field" style={{ display: "grid", gap: "var(--space-2)" }}>
        <span className="field__label">Conteo por método</span>
        {COUNT_FIELDS.map((field) => (
          <label key={field.key} style={{ display: "grid", gridTemplateColumns: "1fr 144px", gap: "var(--space-2)", alignItems: "center" }}>
            <span className="org-page__muted">{field.label}</span>
            <input
              className="input input--compact"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={props.counts[field.key] ?? ""}
              onChange={(e) => props.onCounts(field.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      {props.previewDiff !== null ? (
        <div
          aria-live="polite"
          style={{
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-compact)",
            border:
              props.previewDiff === 0
                ? "1px solid var(--color-success-bg)"
                : "1px solid var(--color-outline)",
            background: props.previewDiff === 0 ? "var(--color-success-bg)" : "var(--color-gallery-white)",
            fontWeight: 600,
          }}
        >
          {props.previewDiff === 0
            ? "Caja cuadrada"
            : props.previewDiff > 0
              ? `Sobrante en caja: ${props.previewDiff.toFixed(2)}`
              : `Faltante en caja: ${props.previewDiff.toFixed(2)}`}
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="close-note">
          Nota de cierre (opcional)
        </label>
        <input
          className="input"
          id="close-note"
          maxLength={280}
          value={props.note}
          onChange={(e) => props.onNote(e.target.value)}
        />
      </div>

      {props.error !== null ? <ErrorNotice error={props.error} onRetry={() => undefined} /> : null}

      <div>
        <button
          type="submit"
          className="btn btn--primary btn--charge"
          disabled={props.busy || props.counts.countedCash === undefined || props.counts.countedCash === ""}
        >
          {props.busy ? "Cerrando…" : "Cerrar caja"}
        </button>
      </div>
    </form>
  );
}

// ---- History rows ----

function SessionRow({ session }: { session: CashSessionView }) {
  const diffNum = session.difference === null ? null : Number.parseFloat(session.difference);
  return (
    <div className="org-page__product">
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Badge tone={session.status === "OPEN" ? "success" : "neutral"}>
          {session.status === "OPEN" ? "Abierta" : "Cerrada"}
        </Badge>
        <span className="org-page__muted">
          {when(session.openedAt)}
          {session.closedAt !== null ? ` → ${when(session.closedAt)}` : ""}
        </span>
        {diffNum !== null ? (
          <Badge tone={diffNum === 0 ? "success" : diffNum > 0 ? "info" : "danger"}>
            {diffNum === 0 ? "Cuadrada" : diffNum > 0 ? "Sobrante" : "Faltante"} {session.difference}
          </Badge>
        ) : null}
      </div>
      <p className="org-page__muted" style={{ margin: 0 }}>
        {session.status === "OPEN"
          ? `Fondo ${money(Number.parseFloat(session.openingFloat))} · ventas ${session.salesCount} · reembolsos ${session.refundsCount} · efectivo ${session.cashTotal}`
          : `Fondo ${money(Number.parseFloat(session.openingFloat))} · ventas ${session.salesCount} · reembolsos ${session.refundsCount} · esperado ${session.expectedCash ?? "—"} · contado ${session.countedCash ?? "—"} · diferencia ${session.difference ?? "—"}`}
        {session.closeNote !== null ? ` · ${session.closeNote}` : ""}
      </p>
    </div>
  );
}
