export type LogLevel = "debug" | "info" | "warn" | "error";

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  module?: string;
  expedienteId?: string;
  fileName?: string;
  phase?: string;
  durationMs?: number;
  status?: number;
  attempt?: number;
  maxAttempts?: number;
  sizeBytes?: number;
  tipo?: string;
  sheets?: string[];
  sheetsLoaded?: string[];
  sheetsIgnored?: string[];
  cuentaCount?: number;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}
