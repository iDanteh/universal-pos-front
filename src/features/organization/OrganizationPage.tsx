import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import {
  addLegalEntity,
  changeVertical,
  effectiveBranding,
  legalEntities,
  onboardOrganization,
  verticalCatalog,
  verticalProfile,
  type AddLegalEntityCommand,
  type EffectiveBrandingView,
  type LegalEntityView,
  type OnboardOrganizationView,
  type VerticalProfileView,
} from "@/api/organization";

const STOCK_POLICY_LABEL: Readonly<Record<string, string>> = {
  FORBIDDEN: "Stock negativo prohibido",
  ALLOWED_WITH_ALERT: "Stock negativo con alerta",
  ALLOWED: "Stock negativo permitido",
};

const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  LOT: "Lote",
  EXPIRY: "Caducidad",
  SERIAL: "Serie",
};

function ProfileMeta({ profile }: { profile: VerticalProfileView }) {
  return (
    <dl className="meta-list">
      <div className="meta-list__row">
        <dt>Unidad base</dt>
        <dd>{profile.baseUnit}</dd>
      </div>
      <div className="meta-list__row">
        <dt>Unidades permitidas</dt>
        <dd>{profile.allowedUnits.join(" · ")}</dd>
      </div>
      <div className="meta-list__row">
        <dt>Política de stock</dt>
        <dd>{STOCK_POLICY_LABEL[profile.negativeStockPolicy] ?? profile.negativeStockPolicy}</dd>
      </div>
      <div className="meta-list__row">
        <dt>Dimensiones de trazabilidad</dt>
        <dd>
          {profile.trackedDimensions.length > 0 ? (
            <span className="pill-row">
              {profile.trackedDimensions.map((d) => (
                <span className="pill-row__item" key={d}>
                  {DIMENSION_LABEL[d] ?? d}
                </span>
              ))}
            </span>
          ) : (
            "Ninguna (venta unitaria simple)"
          )}
        </dd>
      </div>
      <div className="meta-list__row">
        <dt>Atributos de producto</dt>
        <dd>
          {profile.productAttributes.length > 0 ? (
            profile.productAttributes.map((attr) => (
              <span key={attr.code} style={{ display: "block" }}>
                {attr.displayName}
                {attr.required ? (
                  <span className="meta-list__tag"> obligatorio</span>
                ) : (
                  <span className="meta-list__tag"> opcional</span>
                )}
              </span>
            ))
          ) : (
            "Sin atributos extra"
          )}
        </dd>
      </div>
    </dl>
  );
}

function BrandingCard({ branding }: { branding: EffectiveBrandingView }) {
  const colorEntries = Object.entries(branding.colors);
  const templateEntries = Object.entries(branding.templates);
  const flagEntries = Object.entries(branding.featureFlags);
  return (
    <div className="card card--pad">
      <div className="card__title">Branding efectivo (white label)</div>
      <p style={{ fontWeight: 500, marginBottom: "var(--space-2)" }}>
        {branding.name ?? "POS Platform"}
      </p>
      <p className="org-page__muted">
        Fuente: <strong>{branding.source}</strong> — cadena plataforma → marca → organización.
      </p>
      {colorEntries.length > 0 ? (
        <span className="swatches" role="img" aria-label="Colores de la marca">
          {colorEntries.map(([key, value]) => (
            <span className="swatches__item" key={key} title={`${key}: ${value}`}>
              <span className="swatches__dot" style={{ background: value }} aria-hidden="true" />
              {key}
            </span>
          ))}
        </span>
      ) : null}
      {templateEntries.length > 0 ? (
        <dl className="meta-list">
          {templateEntries.map(([key, value]) => (
            <div className="meta-list__row" key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {flagEntries.length > 0 ? (
        <span className="pill-row" style={{ marginTop: "var(--space-3)" }}>
          {flagEntries.map(([key, value]) => (
            <span
              className={`pill-row__item ${value ? "pill-row__item--on" : ""}`}
              key={key}
            >
              {key}: {String(value)}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Radio-pill vertical switcher (declarative change, no per-tenant code). */
function VerticalSwitcher({
  current,
  catalog,
  onApply,
  applying,
}: {
  current: VerticalProfileView | null;
  catalog: readonly VerticalProfileView[];
  onApply: (code: string) => void;
  applying: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const pending = selected ?? current?.code ?? null;
  return (
    <div>
      <div className="pill-row" role="radiogroup" aria-label="Giro del negocio">
        {catalog.map((v) => (
          <button
            type="button"
            key={v.code}
            role="radio"
            aria-checked={pending === v.code}
            className={
              pending === v.code ? "pill-row__option pill-row__option--active" : "pill-row__option"
            }
            onClick={() => setSelected(v.code)}
          >
            {v.displayName}
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: "var(--space-4)" }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={pending === null || pending === current?.code || applying}
          onClick={() => pending !== null && onApply(pending)}
        >
          {applying ? "Cambiando…" : "Aplicar giro seleccionado"}
        </button>
      </div>
    </div>
  );
}

const emptyEntityForm: AddLegalEntityCommand = { legalName: "", tradeName: "", taxId: "", branchName: "", branchCity: "" };

function AddLegalEntityForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AddLegalEntityCommand>(emptyEntityForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await addLegalEntity(form);
      setSuccess("Razón social agregada con su sucursal inicial.");
      setForm(emptyEntityForm);
      onAdded();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="org-page__add">
      <button
        type="button"
        className={open ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Cancelar" : "Agregar razón social"}
      </button>
      {open ? (
        <form className="org-form-grid" onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor="le-legal-name">Razón social *</label>
            <input
              id="le-legal-name"
              className="input"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              placeholder="Comercializadora X SA de CV"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="le-trade-name">Nombre comercial</label>
            <input
              id="le-trade-name"
              className="input"
              value={form.tradeName ?? ""}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
              placeholder="Comercializadora X"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="le-tax-id">RFC (opcional)</label>
            <input
              id="le-tax-id"
              className="input"
              value={form.taxId ?? ""}
              onChange={(e) => setForm({ ...form, taxId: e.target.value.toUpperCase() })}
              placeholder="GME800410HM2"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="le-branch-name">Sucursal inicial *</label>
            <input
              id="le-branch-name"
              className="input"
              value={form.branchName ?? ""}
              onChange={(e) => setForm({ ...form, branchName: e.target.value })}
              placeholder="Sucursal Centro"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="le-branch-city">Ciudad de la sucursal</label>
            <input
              id="le-branch-city"
              className="input"
              value={form.branchCity ?? ""}
              onChange={(e) => setForm({ ...form, branchCity: e.target.value })}
              placeholder="CDMX"
            />
          </div>
          {error !== null ? (
            <p className="org-page__form-error">{error.userMessage}</p>
          ) : null}
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar razón social"}
            </button>
          </div>
          {success !== null ? <p className="org-page__form-success">{success}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

const emptyOnboardForm = { organizationName: "", legalName: "", taxId: "", branchName: "", branchCity: "" };

function NewOrganizationCard({ onCreated }: { onCreated: (result: OnboardOrganizationView) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyOnboardForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await onboardOrganization({
        organizationName: form.organizationName,
        legalName: form.legalName,
        branchName: form.branchName,
        ...(form.taxId.trim() !== "" ? { taxId: form.taxId.trim() } : {}),
        ...(form.branchCity.trim() !== "" ? { branchCity: form.branchCity.trim() } : {}),
      });
      setSuccess(`“${form.organizationName}” creada y activada como organización en curso.`);
      setForm(emptyOnboardForm);
      await onCreated(created);
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card--pad">
      <div className="card__title">Nueva organización</div>
      <p className="org-page__muted" style={{ marginBottom: "var(--space-3)" }}>
        Con tu cuenta creas una organización nueva y te vuelves su dueño
        automáticamente. La sesión cambia a la organización recién creada.
      </p>
      <button
        type="button"
        className={open ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Cancelar" : "Crear organización"}
      </button>
      {open ? (
        <form className="org-form-grid" onSubmit={submit}>
          <div className="field">
            <label className="field__label" htmlFor="onb-org-name">Nombre de la organización *</label>
            <input
              id="onb-org-name"
              className="input"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
              placeholder="Florería Melisa"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="onb-legal-name">Razón social *</label>
            <input
              id="onb-legal-name"
              className="input"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              placeholder="Florería Melisa SA de CV"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="onb-tax-id">RFC (opcional)</label>
            <input
              id="onb-tax-id"
              className="input"
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value.toUpperCase() })}
              placeholder="FME850101XY1"
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="onb-branch-name">Sucursal inicial *</label>
            <input
              id="onb-branch-name"
              className="input"
              value={form.branchName}
              onChange={(e) => setForm({ ...form, branchName: e.target.value })}
              placeholder="Sucursal Centro"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="onb-branch-city">Ciudad</label>
            <input
              id="onb-branch-city"
              className="input"
              value={form.branchCity}
              onChange={(e) => setForm({ ...form, branchCity: e.target.value })}
              placeholder="GDL"
            />
          </div>
          {error !== null ? <p className="org-page__form-error">{error.userMessage}</p> : null}
          <div>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Creando…" : "Crear y activar"}
            </button>
          </div>
          {success !== null ? <p className="org-page__form-success">{success}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

export function OrganizationPage() {
  const { activeTenantId, switchTenant, reload } = useAuth();
  const profileRes = useApiResource<VerticalProfileView>(verticalProfile);
  const entitiesRes = useApiResource<readonly LegalEntityView[]>(legalEntities);
  const brandingRes = useApiResource<EffectiveBrandingView>(effectiveBranding);
  const catalogRes = useApiResource<{ verticals: readonly VerticalProfileView[] }>(verticalCatalog);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<ApiError | null>(null);
  // Optimistic label of the ACTIVE profile only: keyed by code so a stale
  // label can never leak across tenants (the profile always re-loads).
  const appliedTitle = useRef<{ code: string; name: string } | null>(null);
  const firstRun = useRef(true);

  // Tenant switched from the topbar: reload everything in this page.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    profileRes.reload();
    entitiesRes.reload();
    brandingRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const applyVertical = async (code: string) => {
    setApplying(true);
    setApplyError(null);
    try {
      const updated = await changeVertical(code);
      appliedTitle.current = { code: updated.code, name: updated.displayName };
      profileRes.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setApplyError(cause);
    } finally {
      setApplying(false);
    }
  };

  const profile = profileRes.data;
  const profileTitle =
    profile !== null &&
    appliedTitle.current !== null &&
    appliedTitle.current.code === profile.code
      ? appliedTitle.current.name
      : profile?.displayName ?? null;

  return (
    <section aria-labelledby="organization-title">
      <div className="page-header">
        <h1 id="organization-title">Organización</h1>
        <p>
          Giro del negocio, razones sociales y branding de la organización activa.
          Todo lo que ves aquí es lo que el backend resuelve para tu sesión.
        </p>
      </div>

      {profileRes.error !== null ? (
        <ErrorNotice error={profileRes.error} onRetry={profileRes.reload} />
      ) : (
        <div className="org-grid">
          <div className="card card--pad org-grid__wide">
            <div className="card__title">Giro del negocio</div>
            {profileRes.loading || profile === null ? (
              <span className="loading-block">
                <span className="spinner" aria-hidden="true" /> Cargando giro…
              </span>
            ) : (
              <>
                <h2 style={{ marginBottom: "var(--space-1)" }}>{profileTitle}</h2>
                <p className="org-page__muted" style={{ marginBottom: "var(--space-3)" }}>
                  Código <span className="org-page__code">{profile.code}</span>
                </p>
                <ProfileMeta profile={profile} />
                {applyError !== null ? (
                  <p className="org-page__form-error" role="alert">{applyError.userMessage}</p>
                ) : null}
                {catalogRes.data !== null ? (
                  <>
                    <p className="card__title" style={{ marginTop: "var(--space-5)" }}>
                      Cambiar giro (parámetriza el motor; no borra datos)
                    </p>
                    <VerticalSwitcher
                      current={profile}
                      catalog={catalogRes.data.verticals}
                      onApply={(code) => void applyVertical(code)}
                      applying={applying}
                    />
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="org-grid__stack">
            <div className="card card--pad">
              <div className="card__title">Razones sociales</div>
              {entitiesRes.error !== null ? (
                <ErrorNotice error={entitiesRes.error} onRetry={entitiesRes.reload} />
              ) : entitiesRes.loading || entitiesRes.data === null ? (
                <span className="loading-block">
                  <span className="spinner" aria-hidden="true" /> Cargando razones sociales…
                </span>
              ) : (
                <ul className="org-page__list">
                  {entitiesRes.data.map((entity) => (
                    <li className="org-page__list-item" key={entity.id}>
                      <span className="org-page__list-main">
                        <strong>{entity.legalName}</strong>
                        {entity.tradeName ? <span className="org-page__muted"> · {entity.tradeName}</span> : null}
                      </span>
                      <span className="org-page__code">{entity.taxId ?? "Sin RFC registrado"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <AddLegalEntityForm onAdded={entitiesRes.reload} />
            </div>

            {brandingRes.error !== null ? (
              <ErrorNotice error={brandingRes.error} onRetry={brandingRes.reload} />
            ) : brandingRes.loading || brandingRes.data === null ? (
              <div className="card card--pad">
                <span className="loading-block">
                  <span className="spinner" aria-hidden="true" /> Cargando branding…
                </span>
              </div>
            ) : (
              <BrandingCard branding={brandingRes.data} />
            )}
          </div>
        </div>
      )}

      <NewOrganizationCard
        onCreated={async (created) => {
          await switchTenant(created.organizationId);
          await reload();
        }}
      />
    </section>
  );
}
