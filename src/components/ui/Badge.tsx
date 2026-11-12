export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

interface Props {
  tone: BadgeTone;
  children: React.ReactNode;
}

export function Badge({ tone, children }: Props) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ModuleStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "implemented":
      return <Badge tone="success">Implementado</Badge>;
    case "documented":
      return <Badge tone="info">Documentado</Badge>;
    default:
      return <Badge tone="neutral">Planeado</Badge>;
  }
}
