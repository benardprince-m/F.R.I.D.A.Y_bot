// FRIDAY ops: the degradation ladder and honest health status.
//
// Dependencies fail; FRIDAY must degrade predictably and never pretend a degraded system is
// healthy (Product Specification §7.9, §7.8; Constitution Article I). The ladder is:
// full power -> reduced skills -> low-power commands -> offline. Core messaging stays
// available where possible.
//
// Contract: see docs/contracts/friday-core.md (G-02). Pure: it maps a set of component
// states to a capability tier and a truthful, owner-facing status line.

export type ComponentState = "up" | "degraded" | "down";

export interface ComponentHealth {
  /** e.g. "model", "telegram", "memory", "sandbox", "vault", "disk". */
  name: string;
  state: ComponentState;
  /** Optional human note, e.g. "failover to local model". */
  note?: string;
}

/** Capability tier, strongest first. */
export type CapabilityTier = "full" | "reduced" | "low-power" | "offline";

/** Overall status shown to the owner. */
export type HealthStatus = "healthy" | "degraded" | "incident";

export interface HealthReport {
  tier: CapabilityTier;
  status: HealthStatus;
  /** True while the owner can still message FRIDAY. */
  messagingAvailable: boolean;
  summary: string;
}

/** Components whose failure forces the offline tier (no core loop without them). */
const CORE_COMPONENTS = new Set(["model", "telegram", "memory"]);

function find(components: ComponentHealth[], name: string): ComponentHealth | undefined {
  return components.find((c) => c.name === name);
}

/**
 * Compute the capability tier from component health.
 *
 * - all up -> full
 * - a non-core component degraded/down, or a core component degraded -> reduced
 * - a core component down, or several degraded -> low-power
 * - every core component down -> offline
 */
export function capabilityTier(components: ComponentHealth[]): CapabilityTier {
  if (components.length === 0) {
    return "full";
  }
  const core = components.filter((c) => CORE_COMPONENTS.has(c.name));
  const coreDown = core.filter((c) => c.state === "down").length;
  if (core.length > 0 && coreDown === core.length) {
    return "offline";
  }

  const anyDown = components.some((c) => c.state === "down");
  const degradedCount = components.filter((c) => c.state !== "up").length;

  if (anyDown || degradedCount >= 3) {
    return "low-power";
  }
  if (degradedCount >= 1) {
    return "reduced";
  }
  return "full";
}

/**
 * Build the owner-facing health report. The summary is honest: it names what is degraded
 * and why, and never claims healthy when a component is not up.
 */
export function healthReport(components: ComponentHealth[]): HealthReport {
  const tier = capabilityTier(components);
  const notUp = components.filter((c) => c.state !== "up");
  const messaging = find(components, "telegram");
  const messagingAvailable = messaging ? messaging.state !== "down" : true;

  let status: HealthStatus;
  if (notUp.length === 0) {
    status = "healthy";
  } else if (tier === "low-power" || tier === "offline") {
    status = "incident";
  } else {
    status = "degraded";
  }

  const summary =
    status === "healthy"
      ? "Healthy: all components up."
      : `${status === "incident" ? "Incident" : "Degraded"} (${tier}): ` +
        notUp.map((c) => `${c.name}=${c.state}${c.note ? ` (${c.note})` : ""}`).join(", ") +
        (messagingAvailable ? "" : "; messaging unavailable");

  return { tier, status, messagingAvailable, summary };
}
