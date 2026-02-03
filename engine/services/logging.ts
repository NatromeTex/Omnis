/**
 * Logging Service
 * Captures console output and exposes it for in-app viewing.
 */

type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
};

const MAX_LOG_ENTRIES = 2000;
let initialized = false;
let entries: LogEntry[] = [];
const listeners = new Set<(logs: LogEntry[]) => void>();

function notify() {
  const snapshot = entries.slice();
  listeners.forEach((listener) => listener(snapshot));
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val as object);
        }
        if (val instanceof Error) {
          return {
            name: val.name,
            message: val.message,
            stack: val.stack,
          };
        }
        return val;
      },
      2,
    );
  } catch {
    return "[Unserializable]";
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
      }
      if (
        typeof arg === "object" ||
        typeof arg === "number" ||
        typeof arg === "boolean" ||
        typeof arg === "bigint"
      ) {
        return safeStringify(arg);
      }
      if (typeof arg === "undefined") return "undefined";
      if (typeof arg === "function") return `[Function ${arg.name || "anonymous"}]`;
      return String(arg);
    })
    .join(" ");
}

function appendLog(level: LogLevel, args: unknown[]) {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    message: formatArgs(args),
  };

  entries.push(entry);
  if (entries.length > MAX_LOG_ENTRIES) {
    entries = entries.slice(entries.length - MAX_LOG_ENTRIES);
  }
  notify();
}

export function initLogCapture() {
  if (initialized) return;
  initialized = true;

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (...args: unknown[]) => {
    appendLog("log", args);
    original.log(...args);
  };

  console.info = (...args: unknown[]) => {
    appendLog("info", args);
    original.info(...args);
  };

  console.warn = (...args: unknown[]) => {
    appendLog("warn", args);
    original.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    appendLog("error", args);
    original.error(...args);
  };

  console.debug = (...args: unknown[]) => {
    appendLog("debug", args);
    original.debug(...args);
  };
}

export function getLogEntries(): LogEntry[] {
  return entries.slice();
}

export function getLogText(): string {
  return entries
    .map((entry) => {
      const timestamp = new Date(entry.timestamp).toISOString();
      return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
    })
    .join("\n");
}

export function subscribeLogs(listener: (logs: LogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries.slice());
  return () => listeners.delete(listener);
}

export function clearLogs() {
  entries = [];
  notify();
}
