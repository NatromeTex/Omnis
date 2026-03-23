/**
 * Logging Service
 * Captures console output and exposes it for in-app viewing.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export type LogEntry = {
  timestamp: number;
  level: LogLevel;
  message: string;
};

const MAX_LOG_ENTRIES = 2000;
const LOG_STORAGE_KEY = "omnisAppLogs";
let initialized = false;
let entries: LogEntry[] = [];
const listeners = new Set<(logs: LogEntry[]) => void>();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let didHydrate = false;

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
  schedulePersist();
  notify();
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistLogs();
  }, 50);
}

async function persistLogs() {
  try {
    await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort persistence only.
  }
}

async function hydrateLogs() {
  if (didHydrate) return;
  didHydrate = true;
  try {
    const raw = await AsyncStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    entries = parsed
      .filter((item) => item && typeof item.timestamp === "number" && typeof item.level === "string" && typeof item.message === "string")
      .slice(-MAX_LOG_ENTRIES);
    notify();
  } catch {
    // Ignore malformed persisted logs.
  }
}

export function appLog(level: LogLevel, ...args: unknown[]) {
  appendLog(level, args);

  // In headless/background contexts initLogCapture may never run,
  // so still forward to native console once.
  if (!initialized) {
    const sink = console[level] ?? console.log;
    sink(...args);
  }
}

export function initLogCapture() {
  void hydrateLogs();
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
  void AsyncStorage.removeItem(LOG_STORAGE_KEY);
  notify();
}
