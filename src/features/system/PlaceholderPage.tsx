interface Props {
  title: string;
  message: string;
  statusLabel?: string;
}

/** Shared placeholder page for modules planned beyond v0.1.0. */
export function PlaceholderPage({ title, message, statusLabel }: Props) {
  return (
    <section aria-labelledby="placeholder-title" style={{ paddingTop: "var(--space-6)" }}>
      <div className="empty-state" style={{ maxWidth: 640, margin: "0 auto" }}>
        {statusLabel ? <div className="badge badge--info" style={{ marginBottom: "var(--space-4)" }}>{statusLabel}</div> : null}
        <h3 id="placeholder-title" style={{ marginTop: statusLabel ? "var(--space-2)" : 0 }}>{title}</h3>
        <p>{message}</p>
      </div>
    </section>
  );
}
