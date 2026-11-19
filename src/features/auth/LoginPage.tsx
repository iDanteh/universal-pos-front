import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { ApiError } from "@/api/client";

/**
 * Login screen — Steep: serif hero whispers the promise on the left,
 * ONE floating glass card holds the form on the right. Errors are a
 * single muted line (the backend returns a generic, non-enumerable
 * message on purpose).
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      void navigate("/", { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.userMessage);
      } else {
        setError("No se pudo iniciar sesión. Intenta de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <section className="auth-hero">
        <h1>
          La plataforma de operación<br />
          para tu negocio.
        </h1>
        <p>
          Multi-sucursal, offline-first y multi-industria. Inicia sesión
          para operar tu organización en la plataforma.
        </p>
        <div className="auth-hero__meta">
          <span>v0.10.0</span>
          <span>·</span>
          <span>sesiones revocables server-side</span>
        </div>
      </section>

      <form className="auth-card glass" onSubmit={onSubmit} noValidate>
        <h2>Entrar</h2>

        <div className="field">
          <label className="field__label" htmlFor="login-email">
            Correo electrónico
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="login-password">
            Contraseña
          </label>
          <input
            id="login-password"
            className="input"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        {error ? (
          <p className="auth-card__error" role="alert" style={{ color: "var(--color-danger)", fontSize: 15 }}>
            {error}
          </p>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
