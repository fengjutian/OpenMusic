/**
 * Wraps a player intent so its `success` and `error` outcomes are reported
 * to analytics without leaking that concern into the business code.
 *
 * Why this exists:
 *  - The intent surface should not know about analytics. Today
 *    `usePlayerIntents` calls `services.analytics.track(...)` inline; the next
 *    analytics sink (Sentry, Datadog, self-hosted) would force edits in every
 *    caller.
 *  - The set of event names a single intent emits is the contract; declaring it
 *    next to the function that fires it makes the contract grep-able.
 *  - `kind: 'silent'` opts out for intents that fire too often to be useful
 *    (e.g. `seek` at 250ms intervals) — see the review note "tracedIntent".
 */
import type { AnalyticsPort } from '../domain/ports.js';

export interface IntentTrace {
  /** Required: the event the user (or system) requested. */
  request: string;
  /** Optional: emitted on resolution with the same props. */
  success?: string;
  /** Optional: emitted on rejection with the error's user message. */
  error?: string;
  /** `silent` skips analytics entirely; the rest of the contract still applies. */
  kind?: 'tracked' | 'silent';
}

const DEFAULT_PROPS: Readonly<Record<string, string | number | boolean>> = {};

/**
 * Run `body`, reporting the outcome. The error string is sanitised by the
 * analytics sink (technical spec §10.5 / product spec §11) so it is safe to
 * pass through.
 */
export async function tracedIntent<T>(
  analytics: AnalyticsPort,
  trace: IntentTrace,
  props: Record<string, string | number | boolean> = DEFAULT_PROPS,
  body: () => Promise<T>,
): Promise<T> {
  if (trace.kind !== 'silent') {
    analytics.track(trace.request, props);
  }
  try {
    const result = await body();
    if (trace.success) analytics.track(trace.success, props);
    return result;
  } catch (cause) {
    if (trace.error) {
      const message = cause instanceof Error ? cause.message : String(cause);
      analytics.track(trace.error, { ...props, error: message });
    }
    throw cause;
  }
}