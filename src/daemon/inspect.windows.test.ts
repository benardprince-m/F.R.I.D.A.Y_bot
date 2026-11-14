import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  findExtraGatewayServices,
  listManagedOpenClawGatewayServices,
  renderGatewayServiceCleanupHints,
} from "./inspect.js";
import type { ScheduledTaskSnapshot } from "./schtasks-state-probe.js";

const { listScheduledTasksMock, readScheduledTaskCommandMock } = vi.hoisted(() => ({
  listScheduledTasksMock: vi.fn<typeof import("./schtasks-state-probe.js").listScheduledTasks>(),
  readScheduledTaskCommandMock:
    vi.fn<typeof import("./schtasks-layout.js").readScheduledTaskCommand>(),
}));

vi.mock("./schtasks-state-probe.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./schtasks-state-probe.js")>()),
  listScheduledTasks: listScheduledTasksMock,
}));
vi.mock("./schtasks-layout.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./schtasks-layout.js")>()),
  readScheduledTaskCommand: readScheduledTaskCommandMock,
}));

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

describe("findExtraGatewayServices (win32)", () => {
  const originalPlatform = process.platform;
  let nativeEnv: { APPDATA: string };
  const task = (taskPath: string, executable: string, args: string) => ({
    taskPath,
    state: null,
    actions: [{ type: 0, path: executable, arguments: args, workingDirectory: "" }],
  });

  beforeEach(() => {
    nativeEnv = { APPDATA: tempDirs.make("openclaw-windows-inventory-") };
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    listScheduledTasksMock.mockReset().mockReturnValue([]);
    readScheduledTaskCommandMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
  });

  it("skips Scheduled Task queries unless deep mode is enabled", async () => {
    await expect(findExtraGatewayServices({})).resolves.toEqual({ services: [], errors: [] });
    expect(listScheduledTasksMock).not.toHaveBeenCalled();
  });

  it("keeps verified Node and legacy services while rejecting an unrelated branded monitor", async () => {
    listScheduledTasksMock.mockReturnValue([
      task("\\FRIDAY Gateway", "C:\\FRIDAY\\openclaw.exe", "gateway run"),
      task("\\FRIDAY Gateway (dev)", "C:\\FRIDAY\\openclaw.exe", "gateway run --profile dev"),
      task("\\FRIDAY Gateway Backup", "C:\\FRIDAY\\openclaw.exe", "gateway run"),
      task(
        "\\FRIDAY Node",
        "C:\\Program Files\\nodejs\\node.exe",
        '"C:\\FRIDAY\\dist\\entry.js" node run',
      ),
      task("\\Clawdbot Legacy", "C:\\clawdbot\\clawdbot.exe", "run"),
      task(
        "\\FRIDAY Gateway Monitor",
        "C:\\tools\\monitor.exe",
        "--gateway-url http://127.0.0.1:18789",
      ),
      {
        taskPath: "\\FRIDAY CrossAction",
        state: null,
        actions: [
          {
            type: 0,
            path: "C:\\FRIDAY\\openclaw.exe",
            arguments: "node run",
            workingDirectory: "",
          },
          {
            type: 0,
            path: "C:\\tools\\helper.exe",
            arguments: "gateway run",
            workingDirectory: "",
          },
        ],
      },
    ]);

    const result = await findExtraGatewayServices(nativeEnv, { deep: true });

    expect(result.errors).toEqual([]);
    expect(result.services).toEqual([
      expect.objectContaining({
        label: "\\FRIDAY Gateway Backup",
        marker: "openclaw",
        legacy: false,
      }),
      expect.objectContaining({ label: "\\FRIDAY Node", marker: "openclaw", legacy: false }),
      expect.objectContaining({ label: "\\Clawdbot Legacy", marker: "clawdbot", legacy: true }),
      expect.objectContaining({
        label: "\\FRIDAY CrossAction",
        marker: "openclaw",
        legacy: false,
      }),
    ]);
    expect(renderGatewayServiceCleanupHints(result.services).join("\n")).not.toContain("Monitor");
    const managed = await listManagedOpenClawGatewayServices(nativeEnv);
    expect(managed.errors).toEqual([]);
    expect(managed.services.map((service) => service.label)).toEqual([
      "\\FRIDAY Gateway",
      "\\FRIDAY Gateway (dev)",
      "\\FRIDAY Gateway Backup",
    ]);
    for (const service of result.services) {
      expect(service).not.toHaveProperty("windowsProfile");
    }
    for (const service of [...managed.services, ...result.services]) {
      expect(service).not.toHaveProperty("extra");
      expect(service).not.toHaveProperty("managedGateway");
    }
  });

  it.each(["node"])(
    "recognizes verified %s launcher metadata independently of the task label",
    async (kind) => {
      listScheduledTasksMock.mockReturnValue([
        task("\\Custom Service", "C:\\fixtures\\service.cmd", ""),
      ]);
      readScheduledTaskCommandMock.mockResolvedValue({
        programArguments: ["C:\\runtime\\node.exe", "C:\\app\\entry.js", kind, "run"],
        environment: { OPENCLAW_SERVICE_MARKER: "openclaw", OPENCLAW_SERVICE_KIND: kind },
      });

      const result = await findExtraGatewayServices(nativeEnv, { deep: true });

      expect(result.errors).toEqual([]);
      expect(result.services).toEqual([
        expect.objectContaining({ label: "\\Custom Service", marker: "openclaw", legacy: false }),
      ]);
      const managed = await listManagedOpenClawGatewayServices(nativeEnv);
      expect(managed).toEqual({
        services: kind === "gateway" ? [{ ...result.services[0], windowsProfile: "default" }] : [],
        errors: [],
      });
    },
  );

  type IncompleteCase = {
    name: string;
    tasks: ScheduledTaskSnapshot[];
    selected?: string;
    read?: "missing" | "unreadable" | "recognizable";
    projection?: "extras" | "both";
    sources: string[];
    message?: string;
    exact?: boolean;
  };
  const knownLabels = ["\\FRIDAY Gateway (dev)", "\\Clawdbot Gateway"];
  const missingLabels = [...knownLabels, "\\Custom Service"];
  const custom = "\\Custom Assistant";
  it.each<IncompleteCase>([
    ...[undefined].map((actions) => ({
      name: `known selectors with ${actions ? "empty" : "missing"} actions`,
      tasks: ["\\FRIDAY Gateway", "\\Selected Custom"].map((taskPath) => ({
        taskPath,
        state: null,
        actions,
      })),
      selected: "\\Selected Custom",
      projection: "both" as const,
      sources: ["\\FRIDAY Gateway", "\\Selected Custom"],
    })),
    {
      name: "disappeared FRIDAY launchers with unknown native state",
      tasks: missingLabels.map((label) => task(label, "C:\\FRIDAY\\gateway.cmd", "")),
      read: "missing",
      sources: missingLabels,
      exact: true,
    },
    {
      name: "mixed task whose later action runs the Gateway",
      tasks: [
        {
          ...task("\\Mixed Assistant", "C:\\clawdbot\\clawdbot.exe", "run"),
          actions: [
            task(custom, "C:\\clawdbot\\clawdbot.exe", "run").actions[0]!,
            task(custom, "C:\\FRIDAY\\openclaw.exe", "gateway run").actions[0]!,
          ],
        },
      ],
      sources: ["\\Mixed Assistant"],
      message: "Multiple Scheduled Task actions",
    },
  ])(
    "qualifies incomplete inventory: $name",
    async ({ tasks, selected, read, projection, sources, message, exact }) => {
      listScheduledTasksMock.mockReturnValue(tasks);
      if (read === "missing") {
        readScheduledTaskCommandMock.mockResolvedValue(null);
      }
      if (read === "unreadable") {
        readScheduledTaskCommandMock.mockRejectedValue(new Error("Access denied"));
      }
      if (read === "recognizable") {
        readScheduledTaskCommandMock.mockImplementationOnce(async (_env, options) => {
          options?.onLauncherContent?.(
            "@echo off\r\nnode C:\\openclaw\\dist\\entry.js gateway run\r\n",
            "C:\\fixtures\\service.cmd",
          );
          throw new Error("Nested launcher could not be read");
        });
      }
      const env = { ...nativeEnv, OPENCLAW_WINDOWS_TASK_NAME: selected };
      const result = projection
        ? await findExtraGatewayServices(env, { deep: true })
        : await listManagedOpenClawGatewayServices(env, { requireComplete: true });
      expect(result).toEqual({
        services: [],
        errors: sources.map((source) => ({
          source,
          message: exact
            ? "Scheduled Task launcher could not be inspected."
            : expect.stringContaining(message ?? "could not be inspected"),
        })),
      });
      expect(renderGatewayServiceCleanupHints(result.services)).toEqual([]);
      if (projection === "both") {
        expect(await listManagedOpenClawGatewayServices(env)).toEqual(result);
      }
    },
  );
});
