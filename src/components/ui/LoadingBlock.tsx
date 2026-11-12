interface Props {
  label?: string;
}

export function LoadingBlock({ label = "Cargando…" }: Props) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
