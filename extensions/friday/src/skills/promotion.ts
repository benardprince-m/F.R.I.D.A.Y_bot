// FRIDAY skills: the debrief-to-skill loop (§5.1, §7.6; E-04 -> D-01).
//
// This is the compounding half of the design. A task that finished cleanly, with recorded
// evidence, is a *worked example* of how to do that kind of work. Rather than letting the
// debrief go to a dead record, FRIDAY promotes the proven shape of it into a candidate skill,
// which then enters the acquisition protocol (assessment, sandbox, registry) — never straight
// to production.
//
// Contract: see docs/contracts/friday-core.md. Pure: it decides whether a task is promotable
// and describes the candidate; the caller owns the acquisition record and the registry.

import type { TaskRecord } from "../tasks/ledger.js";

export interface SkillCandidate {
  /** Short, stable name for the capability, e.g. "task-<id>". */
  name: string;
  /** The recurring goal this skill would serve. */
  goal: string;
  /** Tools the proven task used, which the skill would declare. */
  tools: string[];
  /** The evidence that made the task promotable, carried onto the candidate. */
  evidence: string[];
  /** Which acquisition stage the candidate starts at (always "detected"). */
  stage: "detected";
}

export interface PromotionDecision {
  promote: boolean;
  reason: string;
  candidate?: SkillCandidate;
}

/**
 * Decide whether a completed task is worth promoting into a candidate skill.
 *
 * A task is promotable only when it is `done`, carries at least one piece of evidence, and
 * names at least one approved tool. A task with no evidence is exactly the "no proof, no
 * success" case the ledger refuses to report as done — so it never becomes a skill. This is
 * what keeps the loop from learning from unverified work.
 */
export function decidePromotion(task: TaskRecord): PromotionDecision {
  if (task.status !== "done") {
    return { promote: false, reason: `task is ${task.status}, not done` };
  }
  if (task.evidence.length === 0) {
    return { promote: false, reason: "task is done but has no evidence; not promotable" };
  }
  if (task.approvedTools.length === 0) {
    return { promote: false, reason: "task used no tools; nothing reusable to declare" };
  }
  return {
    promote: true,
    reason: "task finished with evidence and tools; candidate skill created",
    candidate: {
      name: `task-${task.id}`,
      goal: task.goal,
      tools: [...task.approvedTools],
      evidence: [...task.evidence],
      stage: "detected",
    },
  };
}
