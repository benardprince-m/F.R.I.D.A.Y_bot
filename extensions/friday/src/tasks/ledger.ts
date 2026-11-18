// FRIDAY tasks: the durable task record and the honest debrief (Product Specification
// §6.2, §5.1; AUT-01, AUT-02, AUT-04).
//
// Contract: see docs/contracts/friday-core.md (E-01/E-04). A task is never reported as
// "done" without at least one piece of evidence; a done task with no evidence renders as
// "partial" with an explicit note. Restart must not silently lose an accepted task, so a
// record is plain JSON-serialisable data with no hidden state.

export type TaskStatus =
  | "planned"
  | "running"
  | "waiting-owner"
  | "done"
  | "partial"
  | "failed"
  | "blocked";

export interface TaskRecord {
  id: string;
  owner: string;
  goal: string;
  status: TaskStatus;
  startedAt: string;
  checkpoint?: string;
  approvedTools: string[];
  budgetUsd?: number;
  costUsd?: number;
  nextWake?: string;
  evidence: string[];
}

let counter = 0;

/** Deterministic-enough id for a durable record: time plus a monotonic suffix. */
function nextId(now: string): string {
  counter += 1;
  return `task-${Date.parse(now)}-${counter}`;
}

export function createTask(
  init: { owner: string; goal: string; approvedTools: string[]; budgetUsd?: number },
  now: string,
): TaskRecord {
  return {
    id: nextId(now),
    owner: init.owner,
    goal: init.goal,
    status: "planned",
    startedAt: now,
    approvedTools: [...init.approvedTools],
    ...(init.budgetUsd !== undefined ? { budgetUsd: init.budgetUsd } : {}),
    evidence: [],
  };
}

/** Resume a task from a verified checkpoint after a restart (AUT-02). */
export function resume(task: TaskRecord, checkpoint: string): TaskRecord {
  return { ...task, status: "running", checkpoint };
}

const TASK_STATUSES: readonly TaskStatus[] = [
  "planned",
  "running",
  "waiting-owner",
  "done",
  "partial",
  "failed",
  "blocked",
];

/** Whether `value` is one of the record's statuses (a parse guard for chat input). */
export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Apply a status change, optionally attaching one more piece of evidence (E-01).
 *
 * Evidence is append-only and never overwritten, so the proof trail survives later updates. A
 * blank/absent note leaves the evidence unchanged.
 */
export function withStatus(task: TaskRecord, status: TaskStatus, evidence?: string): TaskRecord {
  const note = evidence?.trim();
  return {
    ...task,
    status,
    evidence: note ? [...task.evidence, note] : task.evidence,
  };
}

/**
 * Render a compact, newest-first list of tasks for chat (E-01).
 *
 * Ordered by `startedAt` (then id) so the most recent task is first; ids are shown so the owner
 * can copy one and reference it in a later command.
 */
export function renderTaskList(tasks: readonly TaskRecord[]): string {
  if (tasks.length === 0) {
    return "No tasks recorded.";
  }
  const ordered = [...tasks].toSorted((a, b) =>
    a.startedAt === b.startedAt ? b.id.localeCompare(a.id) : b.startedAt.localeCompare(a.startedAt),
  );
  return ordered.map((t) => `[${t.status}] ${t.goal} — ${t.id}`).join("\n");
}

/**
 * Render the owner-facing debrief: outcome, proof, cost, failures, next action (§5.1).
 *
 * If a task is marked "done" but carries no evidence, the debrief reports it as partial.
 * This is the honesty invariant: no proof, no success claim.
 */
export function renderDebrief(task: TaskRecord): string {
  const unprovenDone = task.status === "done" && task.evidence.length === 0;
  const status: TaskStatus = unprovenDone ? "partial" : task.status;

  const lines: string[] = [`Task: ${task.goal}`, `Outcome: ${status}`];

  if (unprovenDone) {
    lines.push(
      "Note: marked done without evidence; reporting as partial until a check is attached.",
    );
  }

  if (task.evidence.length > 0) {
    lines.push("Proof:");
    for (const e of task.evidence) {
      lines.push(`- ${e}`);
    }
  } else {
    lines.push("Proof: none recorded.");
  }

  if (task.costUsd !== undefined) {
    lines.push(
      `Cost: $${task.costUsd.toFixed(2)}${task.budgetUsd !== undefined ? ` of $${task.budgetUsd.toFixed(2)} budget` : ""}`,
    );
  }

  if (status === "waiting-owner") {
    lines.push("Needs: your decision before this can continue.");
  } else if (status === "blocked") {
    lines.push("Needs: an input or permission that is currently missing.");
  } else if (status === "failed" || status === "partial") {
    lines.push("Next: I will not retry without your go-ahead.");
  }

  return lines.join("\n");
}
