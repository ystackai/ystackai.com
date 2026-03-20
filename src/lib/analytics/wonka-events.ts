/**
 * wonka-events.ts — Golden Ticket event tracking with deduplication.
 *
 * The teaser page can re-render or remount components multiple times before
 * a user actually navigates away.  Without dedup, every mount fires another
 * "golden_ticket_view" (or similar) event, inflating analytics counts.
 *
 * This module wraps whatever downstream analytics transport you wire up
 * (gtag, posthog, fetch-to-API, etc.) and guarantees each (eventName, key)
 * pair fires at most once per page-load *and* at most once per session.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload sent alongside every golden-ticket event. */
export interface WonkaEventPayload {
  /** Which ticket / promo variant the user saw. */
  ticketId: string;
  /** Optional metadata (A/B bucket, referrer, etc.). */
  meta?: Record<string, string | number | boolean>;
}

/** Signature for the pluggable transport function. */
export type AnalyticsTransport = (
  eventName: string,
  payload: WonkaEventPayload,
) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_PREFIX = "wonka_evt_";

/** Events the teaser page is allowed to emit. */
export const WONKA_EVENTS = {
  /** Teaser section scrolled into viewport. */
  TICKET_VIEW: "golden_ticket_view",
  /** User clicked the CTA / reveal button. */
  TICKET_CLICK: "golden_ticket_click",
  /** Countdown / reveal animation completed. */
  TICKET_REVEAL: "golden_ticket_reveal",
} as const;

export type WonkaEventName = (typeof WONKA_EVENTS)[keyof typeof WONKA_EVENTS];

// ---------------------------------------------------------------------------
// In-memory dedup set (guards within the same page-load)
// ---------------------------------------------------------------------------

const firedThisPageLoad = new Set<string>();

// ---------------------------------------------------------------------------
// Session-storage helpers (guards across soft navigations / re-mounts)
// ---------------------------------------------------------------------------

function sessionKey(eventName: string, ticketId: string): string {
  return `${SESSION_STORAGE_PREFIX}${eventName}::${ticketId}`;
}

function hasSessionFired(eventName: string, ticketId: string): boolean {
  try {
    return sessionStorage.getItem(sessionKey(eventName, ticketId)) === "1";
  } catch {
    // Private browsing or storage full — fall back to in-memory guard only.
    return false;
  }
}

function markSessionFired(eventName: string, ticketId: string): void {
  try {
    sessionStorage.setItem(sessionKey(eventName, ticketId), "1");
  } catch {
    // Silently ignore — in-memory set still protects this page-load.
  }
}

// ---------------------------------------------------------------------------
// Core: trackWonkaEvent
// ---------------------------------------------------------------------------

let _transport: AnalyticsTransport | null = null;

/**
 * Register (or replace) the downstream analytics transport.
 *
 * Call once at app startup:
 * ```ts
 * import { setTransport } from "./wonka-events";
 * setTransport((name, payload) => {
 *   window.gtag?.("event", name, payload);
 * });
 * ```
 */
export function setTransport(fn: AnalyticsTransport): void {
  _transport = fn;
}

/**
 * Fire a golden-ticket event **if it has not already been sent** for the
 * given (eventName, ticketId) pair during this session.
 *
 * @returns `true` when the event was forwarded to the transport,
 *          `false` when it was suppressed as a duplicate.
 */
export function trackWonkaEvent(
  eventName: WonkaEventName,
  payload: WonkaEventPayload,
): boolean {
  const dedupeKey = `${eventName}::${payload.ticketId}`;

  // --- Guard 1: same page-load ----
  if (firedThisPageLoad.has(dedupeKey)) {
    return false;
  }

  // --- Guard 2: same session (survives re-mounts / soft navs) ---
  if (hasSessionFired(eventName, payload.ticketId)) {
    firedThisPageLoad.add(dedupeKey); // sync in-memory set
    return false;
  }

  // --- Fire ---
  firedThisPageLoad.add(dedupeKey);
  markSessionFired(eventName, payload.ticketId);

  if (_transport) {
    _transport(eventName, payload);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Shorthand for tracking a teaser-page view impression. */
export function trackTicketView(ticketId: string, meta?: WonkaEventPayload["meta"]): boolean {
  return trackWonkaEvent(WONKA_EVENTS.TICKET_VIEW, { ticketId, meta });
}

/** Shorthand for tracking a CTA click on the teaser page. */
export function trackTicketClick(ticketId: string, meta?: WonkaEventPayload["meta"]): boolean {
  return trackWonkaEvent(WONKA_EVENTS.TICKET_CLICK, { ticketId, meta });
}

/** Shorthand for tracking the ticket reveal animation completing. */
export function trackTicketReveal(ticketId: string, meta?: WonkaEventPayload["meta"]): boolean {
  return trackWonkaEvent(WONKA_EVENTS.TICKET_REVEAL, { ticketId, meta });
}

// ---------------------------------------------------------------------------
// Testing / reset
// ---------------------------------------------------------------------------

/**
 * Clear all dedup state (in-memory + sessionStorage).
 * Intended for test teardown — not for production use.
 */
export function __resetForTesting(): void {
  firedThisPageLoad.clear();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(SESSION_STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // noop
  }
}
