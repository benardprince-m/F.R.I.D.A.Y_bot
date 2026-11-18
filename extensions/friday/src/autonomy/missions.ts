// FRIDAY autonomy: the night-shift mission planner. While the owner sleeps, FRIDAY does not idle
// — it looks at what is outstanding and decides, in priority order, what it will advance on its
// own (Product Specification §5.1, §7.4, §7.6, §7.8).
//
// A mission is self-directed work FRIDAY may start without a fresh owner prompt. The planner is
// deliberately conservative: it only proposes work the owner already set up (open tasks, memory
// to consolidate, acquisitions mid-protocol), it never invents goals, and every mission carries
// the reason it is eligible. The caller runs the missions and records the outcome.
//
// Contract: see docs/contracts/friday-defense.md. Pure: it maps outstanding state to an ordered
// plan of missions.

import type { TaskRecord } from "../tasks/ledger.js";

export type MissionKind =
  | "consolidate-memory" // merge/compress/decay the memory store
  | "advance-task" // push an open task one step
  | "research-acquisition" // research a detected capability gap
  | "prepare-brief"; // assemble the morning brief

export interface Mission {
  kind: MissionKind;
  /** What the mission is about (task goal, gap, etc.); never secret. */
  subject: string;
  /** Why this mission is eligible now. */
  reason: string;
  /** Higher runs first. */
  priority: number;
}

export interface MissionContext {
  /** Tasks the owner accepted that are not yet done/failed/blocked. */
  openTasks: TaskRecord[];
  /** True when the memory store has records worth consolidating. */
  memoryNeedsConsolidation: boolean;
  /** Capability gaps currently mid-protocol (detected/researched/assessed). */
  openAcquisitions: { id: string; gap: string }[];
  /** True when the owner asked for a morning brief. */
  wantsBrief: boolean;
  /** Upper bound on missions planned in one night shift, so a shift stays bounded. */
  maxMissions: number;
}

const TASK_PRIORITY: Record<TaskRecord["status"], number> = {
  running: 60,
  "waiting-owner": 10, // cannot advance without the owner; low priority, mostly informational
  planned: 50,
  blocked: 5,
  partial: 30,
  done: 0,
  failed: 0,
};

/**
 * Plan the night shift.
 *
 * Ordering reflects urgency and readiness: a running task first (it is already in flight), then
 * planned tasks, then memory consolidation (keeps FRIDAY sharp), then acquisition research
 * (compounds capability), then the brief last (it summarises everything the shift produced).
 * The plan is capped at `maxMissions` so a shift is bounded work, not an unbounded crawl.
 */
export function planNightShift(ctx: MissionContext): Mission[] {
  const missions: Mission[] = [];

  for (const task of ctx.openTasks) {
    if (task.status === "done" || task.status === "failed") {
      continue;
    }
    missions.push({
      kind: "advance-task",
      subject: task.goal,
      reason: `task ${task.id} is ${task.status}`,
      priority: TASK_PRIORITY[task.status],
    });
  }

  if (ctx.memoryNeedsConsolidation) {
    missions.push({
      kind: "consolidate-memory",
      subject: "memory store",
      reason: "records pending merge/compress/decay",
      priority: 40,
    });
  }

  for (const acq of ctx.openAcquisitions) {
    missions.push({
      kind: "research-acquisition",
      subject: acq.gap,
      reason: `acquisition ${acq.id} is mid-protocol`,
      priority: 35,
    });
  }

  if (ctx.wantsBrief) {
    missions.push({
      kind: "prepare-brief",
      subject: "morning brief",
      reason: "owner requested a brief",
      priority: 20,
    });
  }

  return missions
    .toSorted((a, b) => b.priority - a.priority)
    .slice(0, Math.max(0, ctx.maxMissions));
}

/** One owner-facing line summarising a planned shift, for the morning brief. */
export function renderPlan(missions: readonly Mission[]): string {
  if (missions.length === 0) {
    return "Night shift: nothing to advance.";
  }
  return [
    `Night shift planned ${missions.length} mission(s):`,
    ...missions.map((m) => `- ${m.kind}: ${m.subject} (${m.reason})`),
  ].join("\n");
}
