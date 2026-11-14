/** Whether a plugin harness constructs FRIDAY tools inside its runtime. */
export function agentHarnessBuildsOpenClawTools(harnessId: string): boolean {
  return harnessId === "codex" || harnessId === "copilot";
}

/** Whether the selected harness exposes FRIDAY's agent-tool surface. */
export function agentHarnessExposesOpenClawTools(harnessId: string): boolean {
  return harnessId === "openclaw" || agentHarnessBuildsOpenClawTools(harnessId);
}
