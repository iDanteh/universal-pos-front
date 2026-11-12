import { API_BASE, type ProblemPayload } from "./http";

/**
 * Centralized error type: every network/HTTP problem becomes an ApiError so
 * UI components can render meaningful, user-facing messages.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly title: string;
  readonly detail: string | null;
  /** The original error for debugging; never shown to users. */
  override readonly cause: unknown;

  constructor(params: { status: number | null; title: string; detail: string | null; cause?: unknown }) {
    super(params.detail ?? params.title);
    this.name = "ApiError";
    this.status = params.status;
    this.title = params.title;
    this.detail = params.detail;
    this.cause = params.cause;
  }

  /** User-facing copy in Spanish, defensive against unknown payloads. */
  get userMessage(): string {
    switch (this.status) {
      case 400:
        return this.detail ?? "Datos inválidos en la petición.";
      case 401:
        return "No estás autenticado. Inicia sesión de nuevo.";
      case 403:
        return "No tienes permisos para esta operación.";
      case 404:
        return "No encontramos el recurso solicitado.";
      case 409:
        return this.detail ?? "Conflicto con los datos actuales.";
      case 500:
        return "Error interno del servidor. Intenta de nuevo más tarde.";
      case null:
        return "No se pudo conectar con el servidor. Verifica tu conexión.";
      default:
        return this.detail ?? `Error inesperado (${this.status ?? "?"}).`;
    }
  }
}

function problemFrom(payload: unknown): ProblemPayload | null {
  if (typeof payload === "object" && payload !== null && "title" in payload) {
    return payload as ProblemPayload;
  }
  return null;
}

let fallbackTitleCounter = 0;

/** Thin typed fetch wrapper: json in / json out, ProblemDetail-aware errors. */
export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { Accept: "application/json", ...(options?.headers ?? {}) },
      ...options,
    });
  } catch (cause) {
    throw new ApiError({ status: null, title: "network", detail: null, cause });
  }

  if (!response.ok) {
    const raw = await response.json().catch(() => undefined);
    const problem = problemFrom(raw);
    fallbackTitleCounter += 1;
    throw new ApiError({
      status: response.status,
      title: problem?.title ?? `HTTP ${response.status}`,
      detail: problem?.detail ?? null,
      cause: problem ?? raw,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiGet<T>(path: string, options?: RequestInit): Promise<T> {
  return apiJson<T>(path, { method: "GET", ...options });
}
