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

/** The heartbeat's fixed cadence: one beat a minute (G-01, §7.8). */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/** The default overnight window: 23:00–06:00 owner-local (Phase 1 night shift). */
export const DEFAULT_NIGHT_SHIFT: NightShiftWindow = { startHour: 23, endHour: 6 };

export interface HeartbeatDeps {
  /** The owner's local hour, 0-23. */
  localHour: () => number;
  /** The night-shift window, owner-local. */
  window: NightShiftWindow;
  /** Run one liveness beat. In Phase 0 this is the periodic self-check. */
  runLiveness: () => Promise<void>;
  /** Run one night-shift beat (consolidation etc.); Phase 1. */
  runNightShift: () => Promise<void>;
  /** Report a failed beat. */
  onError: (error: unknown) => void;
}

/**
 * Advance the heartbeat by one beat. `lastBeatAt` is threaded through the return value so the
 * caller owns persistence. A paused heartbeat (lockdown / quiet mode) never fires and never
 * advances the clock, so it resumes cleanly when unpaused.
 */
export async function heartbeatTick(
  state: HeartbeatState,
  now: number,
  deps: HeartbeatDeps,
): Promise<HeartbeatState> {
  const decision = decideHeartbeat(
    state,
    now,
    HEARTBEAT_INTERVAL_MS,
    deps.localHour(),
    deps.window,
  );
  if (!decision.due) {
    return state;
  }
  try {
    await (decision.kind === "night-shift" ? deps.runNightShift() : deps.runLiveness());
    return { ...state, lastBeatAt: now };
  } catch (error) {
    // Do not advance lastBeatAt on failure, so the next tick retries rather than skipping a beat.
    deps.onError(error);
    return state;
  }
}
