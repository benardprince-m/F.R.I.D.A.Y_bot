// FRIDAY ops: the heartbeat service (G-01, §7.8; Phase 1 night shift).
//
// Phase 0 needs FRIDAY to be demonstrably alive: a beat every minute, bound to the Gateway's
// lifetime so it stops cleanly and never outlives the host. This service owns that loop. A
// liveness beat runs the F-05 protected-file integrity check; a night-shift beat runs the
// injected unattended work (memory consolidation + mission planning, see `runNightShift`).
//
// Pause semantics: lockdown (or quiet mode) pauses the loop, matching `decideHeartbeat`'s
// "a paused heartbeat never fires". The loop reads the live config each beat, so /lockdown and
// /unlock take effect within one beat without a restart.

import type { OpenClawPluginApi, PluginServiceSchedulerV1 } from "openclaw/plugin-sdk/plugin-entry";
import { readProtectedFiles } from "../persona.js";
import {
  DEFAULT_NIGHT_SHIFT,
  heartbeatTick,
  type HeartbeatState,
  type NightShiftWindow,
} from "./heartbeat.js";
import { checkProtectedIntegrity } from "./integrity-baseline.js";

export interface HeartbeatServiceDeps {
  /** Live plugin config (owner ids, lockdown, personaDir). */
  readConfig: () => { lockedDown: boolean; personaDir?: string };
  /** Host scheduler bound to this service's lifetime. */
  scheduler: PluginServiceSchedulerV1;
  /** Log through the host; never logs message/tool content. */
  logger: { info: (message: string) => void; warn: (message: string) => void };
  /** The plugin runtime, for the plugin-state store the integrity baseline lives in. */
  runtime: OpenClawPluginApi["runtime"];
  /** The night-shift window; defaults to 23:00–06:00. */
  window?: NightShiftWindow;
  /** Inject the clock for tests; defaults to the host scheduler's clock. */
  now?: () => number;
  /**
   * The unattended night-shift work (Phase 1): memory consolidation, mission planning, the
   * morning brief. Runs inside the night-shift window on a beat. A failure here is logged and
   * never crashes the loop — the next beat retries.
   */
  runNightShift?: () => Promise<void>;
}

/** Run the loop until `stop()` is called. The host joins `stop()` before teardown. */
export class HeartbeatService {
  private state: HeartbeatState = { paused: false };
  private job: ReturnType<PluginServiceSchedulerV1["schedule"]> | undefined;
  private running = false;
  private stopping: Promise<void> | undefined;

  constructor(private readonly deps: HeartbeatServiceDeps) {}

  start(): void {
    const now = this.deps.now ?? this.deps.scheduler.now;
    this.job = this.deps.scheduler.schedule({
      id: "friday-heartbeat",
      everyMs: 60_000,
      delayMs: 60_000,
      run: () => this.tick(now()),
    });
    this.deps.logger.info("friday: heartbeat started (every 60s)");
  }

  /** One beat. Public for tests; the scheduler calls it on the cadence. */
  async tick(now: number): Promise<void> {
    if (this.running || this.deps.scheduler.signal.aborted) {
      return;
    }
    this.running = true;
    try {
      this.state = { ...this.state, paused: this.deps.readConfig().lockedDown };
      this.state = await heartbeatTick(this.state, now, {
        localHour: () => new Date(now).getHours(),
        window: this.deps.window ?? DEFAULT_NIGHT_SHIFT,
        runLiveness: () => this.livenessBeat(),
        runNightShift: () => this.nightShiftBeat(),
        onError: (error) =>
          this.deps.logger.warn(`friday: heartbeat beat failed: ${String(error)}`),
      });
    } finally {
      this.running = false;
    }
  }

  private async livenessBeat(): Promise<void> {
    const config = this.deps.readConfig();
    const dir = config.personaDir ?? process.cwd();
    const check = await checkProtectedIntegrity(this.deps.runtime, readProtectedFiles(dir));
    if (check.status === "violation") {
      this.deps.logger.warn(
        "friday: integrity violation — a protected file changed since the owner-approved baseline",
      );
    }
  }

  private async nightShiftBeat(): Promise<void> {
    if (!this.deps.runNightShift) {
      return;
    }
    try {
      await this.deps.runNightShift();
    } catch (error) {
      // Unattended work must never take the loop down; the next beat retries.
      this.deps.logger.warn(`friday: night-shift mission failed: ${String(error)}`);
    }
  }

  stop(): Promise<void> {
    this.stopping ??= (async () => {
      this.deps.scheduler.beginClose();
      await this.job?.stop();
      await this.deps.scheduler.stop();
    })();
    return this.stopping;
  }
}
