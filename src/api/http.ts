/**
 * HTTP base URL: Vite dev proxy rewrites /api & /actuator to the backend so
 * the browser never needs CORS during local development. In production the
 * reverse proxy exposes the API under the same origin (same constants).
 */
export const API_BASE = "";

/** ProblemDetails payload returned by the backend on errors (RFC 9457). */
export interface ProblemPayload {
  readonly title?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly errors?: Record<string, string>;
  readonly [key: string]: unknown;
}
