import { apiGet } from "./client";

/** Backend contract mirrors (backend /api/v1/system/status). */
export interface SystemStatus {
  readonly status: string;
  readonly application: string;
  readonly version: string;
  readonly database: string;
  readonly checkedAt: string;
}

/** Actuator health minimal shape. */
export interface HealthReply {
  readonly status: string;
}

const STALE_MS = 15_000;

export function getSystemStatus(): Promise<SystemStatus> {
  return apiGet<SystemStatus>("/api/v1/system/status");
}

export function getHealth(): Promise<HealthReply> {
  return apiGet<HealthReply>("/actuator/health");
}

export const STALE_THRESHOLD_MS = STALE_MS;
