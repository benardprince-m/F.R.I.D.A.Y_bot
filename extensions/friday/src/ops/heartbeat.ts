// FRIDAY ops: the heartbeat and the night-shift window (§7.8; G-01, Phase 1 heartbeat).
//
// FRIDAY checks its own pulse on a fixed cadence and does its quiet, unattended work inside an
// owner-defined overnight window — memory consolidation, skill research, inbox triage — so the
// morning brief is already written when the owner wakes. Everything here is pure: given the
// clock and the state, it says whether a beat is due and what the beat should do.
//
// Contract: see docs/contracts/friday-core.md.

export interface HeartbeatState {
  /** Epoch ms of the last beat, or undefined if none has run yet. */
  lastBeatAt?: number;
  /** True while the owner has paused proactive work (quiet mode / lockdown). */
  paused: boolean;
}

export interface HeartbeatDecision {
  /** True when a beat is due now. */
  due: boolean;
  /** What kind of beat: a plain liveness check, or the overnight work window. */
  kind: "liveness" | "night-shift";
  reason: string;
}

export interface NightShiftWindow {
  /** Inclusive start hour, 0-23, in the owner's local time. */
  startHour: number;
  /** Exclusive end hour, 0-23. A window that wraps midnight (e.g. 23..6) is supported. */
  endHour: number;
}

/** True when `hour` falls inside the window, including a window that wraps past midnight. */
export function inNightShift(hour: number, window: NightShiftWindow): boolean {
  const { startHour, endHour } = window;
  if (startHour === endHour) {
    return false;
  }
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

/**
 * Decide whether a heartbeat beat is due.
 *
 * A paused heartbeat never fires. Otherwise a beat is due once `intervalMs` has elapsed since
 * the last one. When the current hour is inside the night-shift window the beat is a
 * night-shift beat; otherwise it is a plain liveness check.
 */
export function decideHeartbeat(
  state: HeartbeatState,
  now: number,
  intervalMs: number,
  hour: number,
  window: NightShiftWindow,
): HeartbeatDecision {
  if (state.paused) {
    return { due: false, kind: "liveness", reason: "proactive work paused" };
  }
  const elapsed = state.lastBeatAt === undefined ? Infinity : now - state.lastBeatAt;
  if (elapsed < intervalMs) {
    return { due: false, kind: "liveness", reason: "interval not elapsed" };
  }
  if (inNightShift(hour, window)) {
    return { due: true, kind: "night-shift", reason: "inside the night-shift window" };
  }
  return { due: true, kind: "liveness", reason: "heartbeat interval elapsed" };
}

/** The unattended work FRIDAY performs during the night shift, in order. */
export const NIGHT_SHIFT_TASKS = [
  "consolidate memory: merge, compress, decay",
  "promote proven tasks to candidate skills",
  "research queued skill acquisitions",
  "triage the inbox into a morning brief",
] as const;
