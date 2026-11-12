import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppLayout } from "@/components/site/AppLayout";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ModulesPage } from "@/features/system/ModulesPage";
import { PlaceholderPage } from "@/features/system/PlaceholderPage";
import { OrganizationPage } from "@/features/organization/OrganizationPage";
import { CatalogPage } from "@/features/catalog/CatalogPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { SalesPage } from "@/features/sales/SalesPage";
import { InvoicingPage } from "@/features/invoicing/InvoicingPage";
import { CashPage } from "@/features/cash/CashPage";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { LoginPage } from "@/features/auth/LoginPage";

function NotFound() {
  return (
    <PlaceholderPage
      title="Página no encontrada"
      message="La página que buscas no existe o fue movida."
      statusLabel="Error 404"
    />
  );
}

/**
 * Full-screen splash while the first /me round-trip resolves: never
 * flashes the login screen nor renders protected content prematurely.
 */
function SessionSplash() {
  return (
    <div className="auth-screen" aria-busy="true">
      <span className="loading-block">
        <span className="spinner" aria-hidden="true" /> Verificando sesión…
      </span>
    </div>
  );
}

/**
 * Guards every administrative route: anonymous users see exactly one
 * screen (login); authenticated users get the shell.
 */
function ProtectedRoutes() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <SessionSplash />;
  }
  if (status === "anon" || user === null) {
    return <LoginPage />;
  }
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/modulos" element={<ModulesPage />} />
        <Route path="/organizacion" element={<OrganizationPage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/ventas" element={<SalesPage />} />
        <Route path="/caja" element={<CashPage />} />
        <Route path="/facturacion" element={<InvoicingPage />} />
        <Route
          path="/usuarios"
          element={
            <PlaceholderPage
              title="Usuarios y accesos"
              message="Gestión de usuarios, membresías, roles y permisos."
              statusLabel="Planeado (v0.2+)"
            />
          }
        />
        <Route
          path="/suscripciones"
          element={
            <PlaceholderPage
              title="Suscripciones"
              message="Planes, suscripciones y facturación de la plataforma."
              statusLabel="Planeado"
            />
          }
        />
        <Route
          path="/ajustes"
          element={
            <PlaceholderPage
              title="Ajustes"
              message="Configuración del sistema, marcas (White Label) e integraciones."
              statusLabel="Planeado"
            />
          }
        />
        <Route path="*" element={<NotFound />} />
        <Route path="/" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/**
 * Scrolls to top on navigation (basic yet important UX detail).
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <ProtectedRoutes />
    </AuthProvider>
  );
}
