/**
 * Lightweight structured error reporting. Wraps console.error with optional
 * Sentry forwarding. Drop-in for any code that wants to log an exception.
 *
 * To enable Sentry: set SENTRY_DSN in env, install @sentry/nextjs, and replace
 * the `forwardToSentry` stub with a real call. We deliberately do NOT add the
 * Sentry dependency here — most users won't need it, and it's heavyweight.
 *
 * Usage:
 *   import { logError } from "@/lib/observability";
 *   try { ... } catch (e) { logError("paymongo.create-link", e, { orderId }); }
 */

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logError(
  scope: string,
  error: unknown,
  context?: LogContext,
): void {
  const message = safeStringify(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const ctx = context ? Object.entries(context).map(([k, v]) => `${k}=${v}`).join(" ") : "";

  // Always log to server console (Vercel captures these)
  console.error(`[${scope}] ${message}${ctx ? " | " + ctx : ""}`);
  if (stack && process.env.NODE_ENV !== "production") {
    console.error(stack);
  }

  // Forward to external observability if configured
  forwardToSentry(scope, error, context).catch(() => {
    /* fire-and-forget — don't crash on observability failures */
  });
}

export function logWarn(scope: string, message: string, context?: LogContext): void {
  const ctx = context ? Object.entries(context).map(([k, v]) => `${k}=${v}`).join(" ") : "";
  console.warn(`[${scope}] ${message}${ctx ? " | " + ctx : ""}`);
}

export function logInfo(scope: string, message: string, context?: LogContext): void {
  if (process.env.NODE_ENV !== "production") {
    const ctx = context ? Object.entries(context).map(([k, v]) => `${k}=${v}`).join(" ") : "";
    console.log(`[${scope}] ${message}${ctx ? " | " + ctx : ""}`);
  }
}

/**
 * Stub. Replace with Sentry/Highlight/Datadog when you're ready.
 *
 * To wire up Sentry:
 *   1. npm install @sentry/nextjs
 *   2. npx @sentry/wizard@latest -i nextjs
 *   3. Replace this function body with:
 *      import * as Sentry from "@sentry/nextjs";
 *      Sentry.captureException(error, { tags: { scope }, extra: context });
 */
async function forwardToSentry(
  _scope: string,
  _error: unknown,
  _context?: LogContext,
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  // No-op stub. The real implementation lives where you wire up Sentry.
}
