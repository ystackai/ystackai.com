#!/usr/bin/env node
/**
 * launch-monitor.mjs — Post-launch monitoring dashboard.
 *
 * Aggregates wonka analytics events (golden_ticket_view, _click, _reveal)
 * from a JSONL source and renders an hourly breakdown with progress toward
 * the 1 000-user midnight goal.
 *
 * Usage:
 *   # Live tail from a log file
 *   tail -f /var/log/wonka-events.jsonl | node scripts/launch-monitor.mjs
 *
 *   # One-shot from a file
 *   node scripts/launch-monitor.mjs events.jsonl
 *
 *   # Demo mode (generates synthetic data for testing)
 *   node scripts/launch-monitor.mjs --demo
 *
 * Expected JSONL format (one JSON object per line):
 *   {"event":"golden_ticket_view","ticketId":"abc","ts":"2026-03-20T14:32:00Z"}
 *
 * Does NOT touch any game or site code — standalone monitoring utility.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout, argv } from "node:process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_USERS = 1_000;
const TRACKED_EVENTS = [
  "golden_ticket_view",
  "golden_ticket_click",
  "golden_ticket_reveal",
];
const BAR_WIDTH = 40;
const REFRESH_MS = 2_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<number, Map<string, number>>}  hour (0-23) → event → count */
const hourlyBuckets = new Map();

/** @type {Set<string>} unique ticketIds that triggered a view */
const uniqueUsers = new Set();

/** @type {{ total: number, byEvent: Map<string, number> }} */
const totals = { total: 0, byEvent: new Map() };

let parseErrors = 0;
let lastEventTs = null;

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

/**
 * Parse one JSONL line and update internal state.
 * @param {string} line
 */
function ingestLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    parseErrors++;
    return;
  }

  const event = record.event ?? record.eventName ?? record.name;
  const ticketId = record.ticketId ?? record.ticket_id ?? record.userId ?? record.user_id;
  const tsRaw = record.ts ?? record.timestamp ?? record.time;

  if (!event || !TRACKED_EVENTS.includes(event)) return;

  // Timestamp
  const ts = tsRaw ? new Date(tsRaw) : new Date();
  if (Number.isNaN(ts.getTime())) return;

  const hour = ts.getHours();

  // Update hourly bucket
  if (!hourlyBuckets.has(hour)) {
    hourlyBuckets.set(hour, new Map());
  }
  const bucket = hourlyBuckets.get(hour);
  bucket.set(event, (bucket.get(event) ?? 0) + 1);

  // Update totals
  totals.total++;
  totals.byEvent.set(event, (totals.byEvent.get(event) ?? 0) + 1);

  // Track unique users via ticketId (best proxy available)
  if (ticketId && event === "golden_ticket_view") {
    uniqueUsers.add(ticketId);
  }

  lastEventTs = ts;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a horizontal bar with label.
 * @param {number} value
 * @param {number} max
 * @returns {string}
 */
function bar(value, max) {
  if (max === 0) return "░".repeat(BAR_WIDTH);
  const filled = Math.round((value / max) * BAR_WIDTH);
  return "█".repeat(Math.min(filled, BAR_WIDTH)) +
    "░".repeat(BAR_WIDTH - Math.min(filled, BAR_WIDTH));
}

/** Format a date to HH:MM:SS local time. */
function hhmm(d) {
  return d ? d.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--";
}

/** Hours remaining until local midnight. */
function hoursToMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return (midnight - now) / 3_600_000;
}

/** Required users/hour to hit target by midnight. */
function requiredRunRate() {
  const remaining = TARGET_USERS - uniqueUsers.size;
  if (remaining <= 0) return 0;
  const h = hoursToMidnight();
  return h > 0 ? remaining / h : Infinity;
}

function render() {
  const now = new Date();
  const users = uniqueUsers.size;
  const pct = Math.min(100, (users / TARGET_USERS) * 100);
  const runRate = requiredRunRate();
  const hrsLeft = hoursToMidnight();

  const lines = [];

  lines.push("");
  lines.push("┌─────────────────────────────────────────────────────────┐");
  lines.push("│          🎫 WONKA LAUNCH MONITOR — 1K BY MIDNIGHT       │");
  lines.push("└─────────────────────────────────────────────────────────┘");
  lines.push("");

  // Progress toward goal
  lines.push(`  Target:  ${TARGET_USERS.toLocaleString()} unique users`);
  lines.push(`  Current: ${users.toLocaleString()} (${pct.toFixed(1)}%)`);
  lines.push(`  ${bar(users, TARGET_USERS)}  ${users}/${TARGET_USERS}`);
  lines.push("");

  // Time & run-rate
  lines.push(`  Time now:       ${hhmm(now)}`);
  lines.push(`  Hours to 00:00: ${hrsLeft.toFixed(1)}h`);
  lines.push(`  Last event:     ${hhmm(lastEventTs)}`);
  lines.push(
    `  Run-rate need:  ${runRate === Infinity ? "∞" : runRate.toFixed(1)} users/hr`,
  );
  if (users >= TARGET_USERS) {
    lines.push("  ✓ TARGET HIT!");
  }
  lines.push("");

  // Event totals
  lines.push("  ── Event Totals ──────────────────────────────────────");
  for (const ev of TRACKED_EVENTS) {
    const c = totals.byEvent.get(ev) ?? 0;
    lines.push(`  ${ev.padEnd(24)} ${String(c).padStart(6)}`);
  }
  lines.push(`  ${"TOTAL".padEnd(24)} ${String(totals.total).padStart(6)}`);
  if (parseErrors > 0) {
    lines.push(`  ${"(parse errors)".padEnd(24)} ${String(parseErrors).padStart(6)}`);
  }
  lines.push("");

  // Hourly breakdown
  lines.push("  ── Hourly Breakdown (views) ──────────────────────────");
  const maxHourly = Math.max(
    1,
    ...Array.from(hourlyBuckets.values()).map(
      (b) => b.get("golden_ticket_view") ?? 0,
    ),
  );
  for (let h = 0; h < 24; h++) {
    const bucket = hourlyBuckets.get(h);
    const views = bucket?.get("golden_ticket_view") ?? 0;
    const clicks = bucket?.get("golden_ticket_click") ?? 0;
    const reveals = bucket?.get("golden_ticket_reveal") ?? 0;
    const hourBar = bar(views, maxHourly);
    const label = `${String(h).padStart(2, "0")}:00`;
    lines.push(
      `  ${label} ${hourBar} ${String(views).padStart(4)}v ${String(clicks).padStart(4)}c ${String(reveals).padStart(4)}r`,
    );
  }
  lines.push("");

  // Funnel
  const totalViews = totals.byEvent.get("golden_ticket_view") ?? 0;
  const totalClicks = totals.byEvent.get("golden_ticket_click") ?? 0;
  const totalReveals = totals.byEvent.get("golden_ticket_reveal") ?? 0;
  lines.push("  ── Funnel ────────────────────────────────────────────");
  lines.push(
    `  view → click:  ${totalViews ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0"}%`,
  );
  lines.push(
    `  click → reveal: ${totalClicks ? ((totalReveals / totalClicks) * 100).toFixed(1) : "0.0"}%`,
  );
  lines.push(
    `  view → reveal:  ${totalViews ? ((totalReveals / totalViews) * 100).toFixed(1) : "0.0"}%`,
  );
  lines.push("");

  // Clear screen & write
  stdout.write("\x1B[2J\x1B[H");
  stdout.write(lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Demo mode — synthetic data for quick validation
// ---------------------------------------------------------------------------

function generateDemoEvents() {
  const events = [];
  const now = new Date();
  const startHour = 8;
  const currentHour = now.getHours();

  for (let h = startHour; h <= Math.min(currentHour, 23); h++) {
    // Simulate ramp-up curve: more users in later hours
    const hourMultiplier = Math.pow((h - startHour + 1) / (currentHour - startHour + 1), 0.5);
    const viewCount = Math.floor(30 + hourMultiplier * 90 + Math.random() * 20);

    for (let i = 0; i < viewCount; i++) {
      const ts = new Date(now);
      ts.setHours(h, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
      const ticketId = `user-${h}-${i}`;

      events.push({ event: "golden_ticket_view", ticketId, ts: ts.toISOString() });

      // 40% click-through
      if (Math.random() < 0.4) {
        const clickTs = new Date(ts.getTime() + Math.random() * 30_000);
        events.push({ event: "golden_ticket_click", ticketId, ts: clickTs.toISOString() });

        // 60% of clickers reveal
        if (Math.random() < 0.6) {
          const revealTs = new Date(clickTs.getTime() + Math.random() * 10_000);
          events.push({ event: "golden_ticket_reveal", ticketId, ts: revealTs.toISOString() });
        }
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = argv.slice(2);
  const isDemo = args.includes("--demo");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (isDemo) {
    const events = generateDemoEvents();
    for (const ev of events) {
      ingestLine(JSON.stringify(ev));
    }
    render();
    stdout.write("  (demo mode — showing synthetic data snapshot)\n\n");
    return;
  }

  // Determine input stream
  const inputStream = filePath ? createReadStream(filePath) : stdin;
  const isTTY = !filePath && stdin.isTTY;

  if (isTTY) {
    stdout.write(
      "launch-monitor: reading from stdin (pipe JSONL events or use --demo)\n" +
      "Usage: tail -f events.jsonl | node scripts/launch-monitor.mjs\n" +
      "       node scripts/launch-monitor.mjs events.jsonl\n" +
      "       node scripts/launch-monitor.mjs --demo\n",
    );
    return;
  }

  const rl = createInterface({ input: inputStream, crlfDelay: Infinity });

  let closed = false;

  rl.on("line", (line) => {
    ingestLine(line);
  });

  rl.on("close", () => {
    closed = true;
    render();
    stdout.write("  (stream ended — final snapshot above)\n\n");
  });

  // Periodic refresh for live-tail mode (only while stream is open)
  const timer = setInterval(() => {
    if (closed) {
      clearInterval(timer);
      return;
    }
    render();
  }, REFRESH_MS);

  // Initial render after short delay to ingest buffered lines
  setTimeout(() => {
    if (!closed) render();
  }, 500);
}

main();
