import type { LogContext, LogEntry, LogLevel } from "./types";

const PREFIX = "[memorias]";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function formatConsole(level: LogLevel, message: string, context?: LogContext): string {
  const moduleTag = context?.module ? ` [${context.module}]` : "";
  const ctxKeys = context ? Object.keys(context).filter((k) => k !== "module") : [];
  const ctxSuffix =
    ctxKeys.length > 0 ? ` ${JSON.stringify(context, ctxKeys.length < Object.keys(context!).length ? ctxKeys : undefined)}` : "";
  return `${PREFIX}${moduleTag} ${message}${ctxSuffix}`;
}

function forwardToServer(level: LogLevel, message: string, context?: LogContext): void {
  if (typeof window === "undefined") return;
  if (uploadInProgress) return;
  if (level !== "warn" && level !== "error") return;
  if (document.querySelector("[data-memorias-upload]")) return;

  const payload: LogEntry = {
    ts: new Date().toISOString(),
    level,
    message,
    context: { ...context, userAgent: navigator.userAgent },
  };

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/logs/client", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    // fallback a fetch
  }

  void fetch("/api/logs/client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // ignorar si el servidor no está disponible
  });
}

export interface ClientLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): ClientLogger;
}

function createClientLogger(baseContext: LogContext = {}): ClientLogger {
  function log(level: LogLevel, message: string, context?: LogContext): void {
    const merged = { ...baseContext, ...context };
    const line = formatConsole(level, message, merged);

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else if (level === "debug" && isDev()) {
      console.debug(line);
    } else if (level === "info") {
      console.info(line);
    }

    forwardToServer(level, message, merged);
  }

  return {
    debug: (m, c) => log("debug", m, c),
    info: (m, c) => log("info", m, c),
    warn: (m, c) => log("warn", m, c),
    error: (m, c) => log("error", m, c),
    child: (c) => createClientLogger({ ...baseContext, ...c }),
  };
}

export const clientLogger = createClientLogger();

let uploadInProgress = false;

/** Bloquea el reenvío de logs al servidor durante subidas (evita compilar rutas en caliente). */
export function setUploadInProgress(active: boolean): void {
  uploadInProgress = active;
}
