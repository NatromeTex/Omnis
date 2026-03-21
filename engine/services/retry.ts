export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

function toStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function isTransientNetworkError(error: unknown): boolean {
  const status = toStatus(error);

  if (status !== undefined) {
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }

  if (error instanceof TypeError) {
    // fetch network failures are often surfaced as TypeError in React Native
    return true;
  }

  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const normalized = message.toLowerCase();

  return (
    normalized.includes("network") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("temporarily") ||
    normalized.includes("throttled") ||
    normalized.includes("ecconn")
  );
}

function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number,
): number {
  const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = expDelay * jitterRatio;
  const randomized = expDelay + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(randomized));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitterRatio = options.jitterRatio ?? 0.2;

  let attempt = 0;
  while (attempt < options.maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const canRetry =
        attempt < options.maxAttempts &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : true);

      if (!canRetry) {
        throw error;
      }

      const delayMs = computeDelayMs(
        attempt,
        options.baseDelayMs,
        maxDelayMs,
        jitterRatio,
      );
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw new Error("Retry exhausted");
}
