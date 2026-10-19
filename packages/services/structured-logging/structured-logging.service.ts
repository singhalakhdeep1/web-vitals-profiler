/**
 * Structured Logging Service for Web Vitals Profiler.
 * One JSON object per line (stdout), with the correlation id and user of the current request taken from
 * AsyncLocalStorage, so concurrent requests never mix their context.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface LogContext {
  correlationId: string;
  userId?: string;
  method?: string;
  path?: string;
}

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const storage = new AsyncLocalStorage<LogContext>();

export class StructuredLoggingService {
  constructor(
    private readonly service = "wvp-api",
    private readonly minLevel: Level = (process.env.LOG_LEVEL as Level) ?? "info",
  ) {}

  static createCorrelationId(): string {
    return randomUUID();
  }

  /** Runs `fn` with a request context (every log line inside carries it). */
  runWithContext<T>(context: LogContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  getContext(): LogContext | undefined {
    return storage.getStore();
  }

  /** Adds the signed-in user to the current request context. */
  setUser(userId: string): void {
    const ctx = storage.getStore();
    if (ctx) ctx.userId = userId;
  }

  private write(level: Level, message: string, extra?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[this.minLevel] || process.env.LOG_SILENT === "1") return;
    const ctx = storage.getStore();
    const line = JSON.stringify({ ts: new Date().toISOString(), level, service: this.service, message, correlationId: ctx?.correlationId, userId: ctx?.userId, method: ctx?.method, path: ctx?.path, ...extra });
    (level === "error" ? process.stderr : process.stdout).write(line + "\n");
  }

  logDebug(message: string, extra?: Record<string, unknown>): void {
    this.write("debug", message, extra);
  }

  logInformation(message: string, extra?: Record<string, unknown>): void {
    this.write("info", message, extra);
  }

  logWarning(message: string, extra?: Record<string, unknown>): void {
    this.write("warn", message, extra);
  }

  logError(message: string, error?: unknown, extra?: Record<string, unknown>): void {
    const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    this.write("error", message, { ...extra, error: err });
  }

  /** Security- and business-relevant events (sign-ins, invites, alerts sent, ...). */
  logAuditEvent(eventType: string, description: string, extra?: Record<string, unknown>): void {
    this.write("info", `AUDIT: ${description}`, { ...extra, audit: true, eventType });
  }
}

export const logger = new StructuredLoggingService();
export default StructuredLoggingService;
