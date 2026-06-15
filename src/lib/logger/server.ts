import { appendFile, mkdir } from "fs/promises";
import path from "path";

import type { LogContext, LogEntry, LogLevel } from "./types";
import { LOG_LEVEL_RANK } from "./types";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "memorias.log");

function resolveMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serializeError(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

function formatLine(entry: LogEntry): string {
  const ctx = entry.context;
  const moduleTag = ctx?.module ? `[${ctx.module}] ` : "";
  const ctxSuffix =
    ctx && Object.keys(ctx).length > 0
      ? ` ${JSON.stringify(ctx)}`
      : "";
  return `${entry.ts} [${entry.level.toUpperCase()}] ${moduleTag}${entry.message}${ctxSuffix}`;
}

async function writeToFile(line: string): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, `${line}\n`, "utf8");
  } catch {
    // No bloquear la app si falla el volcado a disco
  }
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  error(message: string, err: unknown, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function createLogger(baseContext: LogContext = {}, minLevel: LogLevel = resolveMinLevel()): Logger {
  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[minLevel];
  }

  function emit(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const merged: LogContext = { ...baseContext, ...context };
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      context: Object.keys(merged).length > 0 ? merged : undefined,
    };

    const line = formatLine(entry);

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    void writeToFile(line);
  }

  return {
    debug(message, context) {
      emit("debug", message, context);
    },
    info(message, context) {
      emit("info", message, context);
    },
    warn(message, context) {
      emit("warn", message, context);
    },
    error(message: string, errOrContext?: unknown, maybeContext?: LogContext) {
      if (errOrContext instanceof Error || (errOrContext !== null && typeof errOrContext !== "object")) {
        const errFields = serializeError(errOrContext);
        emit("error", message, { ...maybeContext, ...errFields });
        return;
      }
      emit("error", message, errOrContext as LogContext | undefined);
    },
    child(context) {
      return createLogger({ ...baseContext, ...context }, minLevel);
    },
  };
}

export const logger = createLogger();

/** Eventos enviados desde el navegador (subida, verificación, etc.) */
export function logClientEvent(entry: Omit<LogEntry, "ts"> & { ts?: string }): void {
  const full: LogEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    level: entry.level,
    message: entry.message,
    context: { module: "client", ...entry.context },
  };
  const line = formatLine(full);
  console.log(line);
  void writeToFile(line);
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
