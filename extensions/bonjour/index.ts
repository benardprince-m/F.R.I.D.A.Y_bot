import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

function formatBonjourInstanceName(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "FRIDAY";
  }
  if (/openclaw/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (FRIDAY)`;
}

export default definePluginEntry({
  id: "bonjour",
  name: "Bonjour Gateway Discovery",
  description: "Advertise the local FRIDAY gateway over Bonjour/mDNS.",
  register(api) {
    api.registerGatewayDiscoveryService({
      id: "bonjour",
      advertise: async (ctx) => {
        const [
          { startGatewayBonjourAdvertiser },
          { registerUncaughtExceptionHandler, registerUnhandledRejectionHandler },
        ] = await Promise.all([
          import("./src/advertiser.js"),
          import("openclaw/plugin-sdk/runtime"),
        ]);
        return startGatewayBonjourAdvertiser(
          {
            instanceName: formatBonjourInstanceName(ctx.machineDisplayName),
            gatewayPort: ctx.gatewayPort,
            gatewayTlsEnabled: ctx.gatewayTlsEnabled,
            gatewayTlsFingerprintSha256: ctx.gatewayTlsFingerprintSha256,
            gatewayDirectReachable: ctx.gatewayDirectReachable,
            sshPort: ctx.sshPort,
            tailnetDns: ctx.tailnetDns,
            cliPath: ctx.cliPath,
            minimal: ctx.minimal,
          },
          {
            logger: api.logger,
            registerUncaughtExceptionHandler,
            registerUnhandledRejectionHandler,
          },
        );
      },
    });
  },
});
