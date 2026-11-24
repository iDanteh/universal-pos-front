import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useApiResource } from "@/hooks/useApiResource";
import { verticalProfile, type VerticalProfileView } from "@/api/organization";

interface NavItem {
  to: string;
  label: string;
  status?: "ready" | "planned";
  /** v0.10: only shown when the ACTIVE tenant grants any of these codes. */
  requires?: readonly string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "General",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/catalogo", label: "Catálogo", status: "ready" },
      { to: "/inventario", label: "Inventario", status: "ready" },
      { to: "/ventas", label: "Ventas", status: "ready" },
      { to: "/caja", label: "Caja", status: "ready" },
      { to: "/facturacion", label: "Facturación", status: "ready" },
      { to: "/reportes", label: "Reportes", status: "ready", requires: ["sales.read"] },
      { to: "/modulos", label: "Módulos", status: "planned" },
    ],
  },
  {
    label: "Administración",
    items: [
      { to: "/organizacion", label: "Organización", status: "ready" },
      { to: "/usuarios", label: "Usuarios", status: "ready", requires: ["users.manage", "roles.manage"] },
      { to: "/suscripciones", label: "Suscripciones", status: "planned" },
    ],
  },
  {
    label: "Sistema",
    items: [{ to: "/ajustes", label: "Ajustes", status: "planned" }],
  },
] as const;

function SidebarLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      className="sidebar__link"
      aria-current="page"
      onClick={onClick}
      end={item.to === "/"}
    >
      {item.label}
      {item.status === "planned" ? <span className="sidebar__badge">pronto</span> : null}
    </NavLink>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

/**
 * Administrative shell: persistent navigation + content area.
 * UX requirements applied:
 *  - one clear navigation surface with grouped items;
 *  - mobile drawer with overlay & Escape close (a11y);
 *  - active state conveyed by color AND position (aria-current).
 * v0.2: the topbar binds the session — org name (server-verified),
 * user chip and a working logout.
 */
/** Vertical identity chip labels; colors arrive via CSS per giro. */
const giroChips: Readonly<Record<string, string>> = {
  RETAIL: "Retail",
  RESTAURANT: "Restaurante",
  PHARMACY: "Farmacia",
  HARDWARE: "Ferretería",
  DISTRIBUTION: "Distribución",
  CUSTOM: "Personalizado",
};
export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { user, organizationName, organizations, activeTenantId, logout, switchTenant, can } = useAuth();
  const profileRes = useApiResource<VerticalProfileView>(verticalProfile);
  const giro = profileRes.data?.code;

  // The giro chip belongs to the ACTIVE tenant: refetch when it changes.
  const profileFirstRun = useRef(true);
  useEffect(() => {
    if (profileFirstRun.current) {
      profileFirstRun.current = false;
      return;
    }
    profileRes.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);
  const navigateHome = () => {
    setDrawerOpen(false);
    void navigate("/");
  };

  const handleLogout = async () => {
    await logout();
    void navigate("/", { replace: true });
  };

  const sidebarNode = (
    <aside
      className={drawerOpen ? "sidebar sidebar--open" : "sidebar"}
      id="site-sidebar"
      aria-label="Navegación principal"
    >
      <button
        type="button"
        className="sidebar__brand"
        onClick={navigateHome}
        aria-label="POS Platform, ir al inicio"
      >
        <span className="sidebar__brand-mark" aria-hidden="true">P</span>
        <span>POS Platform</span>
      </button>

      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (item) => item.requires === undefined || can(...item.requires),
        );
        if (items.length === 0) {
          return null;
        }
        return (
          <nav className="sidebar__group" key={group.label} aria-label={group.label}>
            <div className="sidebar__group-label">{group.label}</div>
            {items.map((item) => (
              <SidebarLink key={item.to} item={item} onClick={closeDrawer} />
            ))}
          </nav>
        );
      })}

      <div className="sidebar__footer">v0.13.0</div>
    </aside>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#page-content">
        Saltar al contenido
      </a>
      {sidebarNode}
      {drawerOpen ? (
        <div className="sidebar-overlay" onClick={closeDrawer} aria-hidden="true" />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="hamburger"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            aria-controls="site-sidebar"
            aria-label={drawerOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
          >
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
              <path d="M1 1h14M1 7h14M1 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          {organizations.length > 1 && activeTenantId !== null ? (
            <select
              className="topbar__switch"
              aria-label="Organización activa"
              value={activeTenantId}
              onChange={(e) => void switchTenant(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.organizationId} value={org.organizationId}>
                  {org.organizationName}
                </option>
              ))}
            </select>
          ) : (
            <span className="topbar__title">
              {organizationName ?? "Panel de administración"}
            </span>
          )}
          <span className="topbar__spacer" />
          {giro !== undefined && giroChips[giro] !== undefined ? (
            <span className="topbar__giro" data-giro={giro}>{giroChips[giro]}</span>
          ) : null}
          {user !== null ? (
            <span className="topbar__user" title={user.email}>
              <span className="topbar__avatar" aria-hidden="true">{initials(user.displayName)}</span>
              {user.displayName}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleLogout}
            disabled={organizationName === null && user === null}
          >
            Salir
          </button>
        </header>

        <main className="app-content" id="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
