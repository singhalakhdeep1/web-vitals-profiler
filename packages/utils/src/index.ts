type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_PREFIX = "[Web Vitals Profiler]";

/** Structured logger for extension contexts. */
export const logger = {
  debug(message: string, ...args: unknown[]): void {
    log("debug", message, args);
  },
  info(message: string, ...args: unknown[]): void {
    log("info", message, args);
  },
  warn(message: string, ...args: unknown[]): void {
    log("warn", message, args);
  },
  error(message: string, ...args: unknown[]): void {
    log("error", message, args);
  },
};

function log(level: LogLevel, message: string, args: unknown[]): void {
  const formatted = `${LOG_PREFIX} ${message}`;
  switch (level) {
    case "debug":
      console.debug(formatted, ...args);
      break;
    case "info":
      console.info(formatted, ...args);
      break;
    case "warn":
      console.warn(formatted, ...args);
      break;
    case "error":
      console.error(formatted, ...args);
      break;
  }
}

/** Formats milliseconds into a human-readable duration string. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Returns a rating label with color class for Tailwind styling. */
export function getRatingColorClass(rating: "good" | "needs-improvement" | "poor"): string {
  switch (rating) {
    case "good":
      return "text-emerald-600";
    case "needs-improvement":
      return "text-amber-600";
    case "poor":
      return "text-red-600";
  }
}

/** Safely parses JSON without throwing. */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Generates a unique ID for metric entries. */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
