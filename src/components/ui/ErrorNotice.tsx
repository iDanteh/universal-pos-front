import type { ApiError } from "@/api/client";

interface Props {
  error: ApiError;
  onRetry?: () => void;
}

/** Centralized, accessible error banner. Never dumps raw error internals. */
export function ErrorNotice({ error, onRetry }: Props) {
  return (
    <div className="error-notice" role="alert">
      <span aria-hidden="true" style={{ fontSize: "var(--text-body-lg)", lineHeight: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <strong>No se pudo cargar la información.</strong>
        <div style={{ fontSize: "var(--text-small)", marginTop: 4 }}>{error.userMessage}</div>
        {onRetry ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onRetry}
            style={{ marginTop: 10, color: "var(--color-danger)", borderColor: "var(--color-danger-border)" }}
          >
            Reintentar
          </button>
        ) : null}
      </div>
    </div>
  );
}
