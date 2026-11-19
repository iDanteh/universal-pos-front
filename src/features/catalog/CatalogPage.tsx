import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge } from "@/components/ui/Badge";
import {
  addVariant,
  catalogProducts,
  catalogTaxes,
  catalogUnits,
  createProduct,
  type CatalogUnits,
  type CreateProductCommand,
  type ProductView,
  type TaxRateView,
  type VariantItemCommand,
} from "@/api/catalog";

/** Display-only formatting of the NUMERIC(14,4) string (never a float on the wire). */
function formatPrice(price: string | null): string {
  if (price === null) return "—";
  const amount = Number.parseFloat(price);
  if (Number.isNaN(amount)) return price;
  return amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function VariantList({ units, attrs, taxes, product }: {
  units: CatalogUnits | null;
  attrs: CatalogUnits["productAttributes"];
  taxes: readonly TaxRateView[];
  product: ProductView;
}) {
  return (
    <ul className="org-page__list" style={{ marginTop: "var(--space-2)" }}>
      {product.variants.map((variant) => {
        const rate = taxes.find((t) => t.code === variant.taxRateCode);
        return (
        <li className="org-page__list-item" key={variant.id}>
          <strong>{variant.sku}</strong>
          <span className="org-page__muted">
            {variant.unit} · ${formatPrice(variant.price)}
            {variant.barcode !== null ? ` · ${variant.barcode}` : ""}
            {rate !== undefined ? ` · ${rate.code} (${rate.scheme})` : ""}
            {variant.iepsRateCode !== null && variant.iepsRateCode !== "" ? ` · IEPS ${variant.iepsRateCode}` : ""}
            {units === null || attrs.length === 0
              ? ""
              : Object.entries(variant.attributes ?? {})
                  .map(([key, value]) => {
                    const def = attrs.find((a) => a.code === key);
                    return def === undefined ? key : `${def.displayName}: ${value}`;
                  })
                  .map((label) => ` · ${label}`)
                  .join("")}
          </span>
        </li>
        );
      })}
    </ul>
  );
}

interface VariantFormState {
  sku: string;
  barcode: string;
  unit: string;
  price: string;
  /** "" = sin impuesto (legacy-compatible). */
  taxRateCode: string;
  /** "" = sin IEPS (v0.11 · ADR-021). */
  iepsRateCode: string;
  attributes: Record<string, string>;
}

function VariantFields({
  units,
  taxes,
  form,
  onForm,
}: {
  units: CatalogUnits;
  taxes: readonly TaxRateView[];
  form: VariantFormState;
  onForm: (next: VariantFormState) => void;
}) {
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="var-sku">SKU *</label>
        <input
          id="var-sku"
          className="input"
          value={form.sku}
          onChange={(e) => onForm({ ...form, sku: e.target.value.toUpperCase() })}
          placeholder="CER-355"
          required
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="var-unit">Unidad *</label>
        <select
          id="var-unit"
          className="input"
          value={form.unit}
          onChange={(e) => onForm({ ...form, unit: e.target.value })}
        >
          {units.allowedUnits.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="var-barcode">Código de barras</label>
        <input
          id="var-barcode"
          className="input"
          value={form.barcode}
          onChange={(e) => onForm({ ...form, barcode: e.target.value })}
          placeholder="7501234567890"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="var-price">Precio (MXN)</label>
        <input
          id="var-price"
          className="input"
          type="number"
          min="0"
          step="0.0001"
          value={form.price}
          onChange={(e) => onForm({ ...form, price: e.target.value })}
          placeholder="28.50"
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="var-tax">Impuesto</label>
        <select
          id="var-tax"
          className="input"
          value={form.taxRateCode}
          onChange={(e) => onForm({ ...form, taxRateCode: e.target.value })}
        >
          <option value="">Sin impuesto</option>
          {taxes.map((rate) => (
            <option key={rate.code} value={rate.code}>
              {rate.code} · {rate.scheme} {rate.factor === "TASA" ? `${(Number.parseFloat(rate.rate) * 100).toFixed(1)}%` : "exento"}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="var-ieps">IEPS (opcional)</label>
        <select
          id="var-ieps"
          className="input"
          value={form.iepsRateCode}
          onChange={(e) => onForm({ ...form, iepsRateCode: e.target.value })}
        >
          <option value="">Sin IEPS</option>
          {taxes
            .filter((rate) => rate.scheme === "IEPS")
            .map((rate) => (
              <option key={rate.code} value={rate.code}>
                {rate.code} · {rate.scheme} {rate.factor === "TASA" ? `${(Number.parseFloat(rate.rate) * 100).toFixed(1)}%` : "exento"}
              </option>
            ))}
        </select>
      </div>
      {units.productAttributes.map((attr) => (
        <div className="field" key={attr.code}>
          <label className="field__label" htmlFor={`attr-${attr.code}`}>
            {attr.displayName}{attr.required ? " *" : ""}
          </label>
          <input
            id={`attr-${attr.code}`}
            className="input"
            value={form.attributes[attr.code] ?? ""}
            onChange={(e) =>
              onForm({ ...form, attributes: { ...form.attributes, [attr.code]: e.target.value } })
            }
            required={attr.required}
          />
        </div>
      ))}
    </>
  );
}

const emptyVariant: VariantFormState = {
  sku: "",
  barcode: "",
  unit: "",
  price: "",
  taxRateCode: "",
  iepsRateCode: "",
  attributes: {},
};

/**
 * CATALOG page (fase 3): the tenant's product/variant catalog plus the
 * declarative creation form (units and product attributes come from the
 * ACTIVE vertical — the backend re-validates everything server-side).
 */
export function CatalogPage() {
  const { activeTenantId } = useAuth();
  const unitsRes = useApiResource<CatalogUnits>(catalogUnits);
  const productsRes = useApiResource<readonly ProductView[]>(catalogProducts);
  const taxesRes = useApiResource<readonly TaxRateView[]>(catalogTaxes);
  const taxes = taxesRes.data ?? [];

  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState({ name: "", description: "", category: "", baseUnit: "" });
  const [variant, setVariant] = useState<VariantFormState>(emptyVariant);
  const [withVariant, setWithVariant] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Per-product "add variant" state (only one open at a time keeps it simple).
  const [variantTarget, setVariantTarget] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState<VariantFormState>(emptyVariant);
  const [variantBusy, setVariantBusy] = useState(false);
  const [variantError, setVariantError] = useState<ApiError | null>(null);
  const firstRun = useRef(true);

  // Tenant switched from the topbar: the catalog belongs to the ACTIVE tenant.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    unitsRes.reload();
    productsRes.reload();
    taxesRes.reload();
    setVariantTarget(null);
    setVariantForm(emptyVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const units = unitsRes.data;

  // Default unit follows the vertical as soon as it loads.
  useEffect(() => {
    if (units !== null) {
      setVariant((v) => (v.unit === "" ? { ...v, unit: units.baseUnit } : v));
    }
  }, [units]);

  const submitProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (units === null) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const attributesEntries = Object.entries(variant.attributes).filter(([, value]) => value !== "");
      const firstVariant: VariantItemCommand = {
        sku: variant.sku,
        unit: variant.unit === "" ? units.baseUnit : variant.unit,
        barcode: variant.barcode,
        ...(variant.price === "" ? {} : { price: variant.price }),
        ...(variant.taxRateCode === "" ? {} : { taxRateCode: variant.taxRateCode }),
        ...(variant.iepsRateCode === "" ? {} : { iepsRateCode: variant.iepsRateCode }),
        ...(attributesEntries.length === 0 ? {} : { attributes: Object.fromEntries(attributesEntries) }),
      };
      const command: CreateProductCommand = {
        name: product.name,
        description: product.description,
        category: product.category,
        baseUnit: product.baseUnit === "" ? units.baseUnit : product.baseUnit,
        variants: withVariant ? [firstVariant] : [],
      };
      const created = await createProduct(command);
      setSuccess(`Producto «${created.name}» creado con ${created.variants.length} variante(s).`);
      setProduct({ name: "", description: "", category: "", baseUnit: "" });
      setVariant({ ...emptyVariant, unit: units.baseUnit });
      setOpen(false);
      productsRes.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setCreating(false);
    }
  };

  const submitVariant = async (productId: string) => {
    if (units === null) return;
    setVariantBusy(true);
    setVariantError(null);
    try {
      const attributesEntries = Object.entries(variantForm.attributes).filter(([, value]) => value !== "");
      await addVariant(productId, {
        sku: variantForm.sku,
        unit: variantForm.unit === "" ? units.baseUnit : variantForm.unit,
        barcode: variantForm.barcode,
        ...(variantForm.price === "" ? {} : { price: variantForm.price }),
        ...(variantForm.taxRateCode === "" ? {} : { taxRateCode: variantForm.taxRateCode }),
        ...(variantForm.iepsRateCode === "" ? {} : { iepsRateCode: variantForm.iepsRateCode }),
        ...(attributesEntries.length === 0 ? {} : { attributes: Object.fromEntries(attributesEntries) }),
      });
      setVariantTarget(null);
      setVariantForm(emptyVariant);
      productsRes.reload();
    } catch (cause) {
      if (cause instanceof ApiError) setVariantError(cause);
    } finally {
      setVariantBusy(false);
    }
  };

  const products = productsRes.data ?? [];

  return (
    <section aria-labelledby="catalog-title">
      <div className="page-header">
        <h1 id="catalog-title">Catálogo</h1>
        <p>
          Productos y variantes (SKU) de la organización activa. Unidades y atributos
          los define tu giro — nada se inventa aquí.
        </p>
      </div>

      {unitsRes.error !== null ? (
        <ErrorNotice error={unitsRes.error} onRetry={unitsRes.reload} />
      ) : null}

      <div className="org-grid">
        <div className="card card--pad org-grid__wide">
          <div className="card__title">Productos</div>
          {productsRes.loading ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando catálogo…
            </span>
          ) : productsRes.error !== null ? (
            <ErrorNotice error={productsRes.error} onRetry={productsRes.reload} />
          ) : products.length === 0 ? (
            <p className="org-page__muted">
              Aún no hay productos. Crea el primero con el formulario de la derecha.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              {products.map((item) => (
                <div key={item.id} className="org-page__product">
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
                    <strong>{item.name}</strong>
                    <span className="org-page__code">{item.baseUnit}</span>
                    {item.category !== null ? (
                      <span className="org-page__muted">{item.category}</span>
                    ) : null}
                    <Badge tone={item.status === "ACTIVE" ? "success" : "neutral"}>
                      {item.status === "ACTIVE" ? "Activo" : "Descontinuado"}
                    </Badge>
                  </div>
                  {item.description !== null ? (
                    <p className="org-page__muted" style={{ margin: 0 }}>{item.description}</p>
                  ) : null}
                  <VariantList
                    product={item}
                    units={units}
                    attrs={units?.productAttributes ?? []}
                    taxes={taxes}
                  />
                  <div className="org-page__add" style={{ marginTop: "var(--space-3)" }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-expanded={variantTarget === item.id}
                      onClick={() => {
                        if (variantTarget === item.id) {
                          setVariantTarget(null);
                          setVariantForm(emptyVariant);
                        } else {
                          setVariantTarget(item.id);
                          setVariantForm({ ...emptyVariant, unit: units?.baseUnit ?? "" });
                          setVariantError(null);
                        }
                      }}
                    >
                      {variantTarget === item.id ? "Cancelar" : "Agregar variante"}
                    </button>
                    {variantTarget === item.id && units !== null ? (
                      <form className="org-form-grid" onSubmit={(event) => {
                        event.preventDefault();
                        void submitVariant(item.id);
                      }}>
                        <VariantFields units={units} taxes={taxes} form={variantForm} onForm={setVariantForm} />
                        {variantError !== null ? (
                          <p className="org-page__form-error">{variantError.userMessage}</p>
                        ) : null}
                        <div>
                          <button type="submit" className="btn btn--primary" disabled={variantBusy}>
                            {variantBusy ? "Guardando…" : "Guardar variante"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card--pad">
          <div className="card__title">Nuevo producto</div>
          {unitsRes.loading || units === null ? (
            <span className="loading-block">
              <span className="spinner" aria-hidden="true" /> Cargando giro…
            </span>
          ) : (
            <>
              <p className="org-page__muted" style={{ marginTop: 0 }}>
                Giro <span className="org-page__code">{units.verticalCode}</span> · unidades
                {" "}{units.allowedUnits.join(" · ")}
              </p>
              <button
                type="button"
                className={open ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {open ? "Cancelar" : "Agregar producto"}
              </button>
              {open ? (
                <form className="org-form-grid" onSubmit={submitProduct} style={{ marginTop: "var(--space-3)" }}>
                  <div className="field">
                    <label className="field__label" htmlFor="prod-name">Nombre *</label>
                    <input
                      id="prod-name"
                      className="input"
                      value={product.name}
                      onChange={(e) => setProduct({ ...product, name: e.target.value })}
                      placeholder="Cerveza Artesanal"
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="prod-category">Categoría</label>
                    <input
                      id="prod-category"
                      className="input"
                      value={product.category}
                      onChange={(e) => setProduct({ ...product, category: e.target.value })}
                      placeholder="Bebidas"
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="prod-unit">Unidad base *</label>
                    <select
                      id="prod-unit"
                      className="input"
                      value={product.baseUnit === "" ? units.baseUnit : product.baseUnit}
                      onChange={(e) => setProduct({ ...product, baseUnit: e.target.value })}
                    >
                      {units.allowedUnits.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label className="field__label" htmlFor="prod-description">Descripción</label>
                    <input
                      id="prod-description"
                      className="input"
                      value={product.description}
                      onChange={(e) => setProduct({ ...product, description: e.target.value })}
                      placeholder="Botella 355 ml"
                    />
                  </div>
                  <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: "var(--space-2)" }}>
                    <input
                      type="checkbox"
                      checked={withVariant}
                      onChange={(e) => setWithVariant(e.target.checked)}
                    />
                    <span>Primera variante (SKU)</span>
                  </label>
                  {withVariant ? (
                    <VariantFields units={units} taxes={taxes} form={variant} onForm={setVariant} />
                  ) : null}
                  {error !== null ? (
                    <p className="org-page__form-error" style={{ gridColumn: "1 / -1" }}>
                      {error.userMessage}
                    </p>
                  ) : null}
                  <div>
                    <button type="submit" className="btn btn--primary" disabled={creating}>
                      {creating ? "Guardando…" : "Crear producto"}
                    </button>
                  </div>
                  {success !== null ? (
                    <p className="org-page__form-success" style={{ gridColumn: "1 / -1" }}>{success}</p>
                  ) : null}
                </form>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
