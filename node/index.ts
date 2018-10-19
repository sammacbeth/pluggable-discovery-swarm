import { SwarmOptions } from "@sammacbeth/discovery-swarm-ts";
import HyperDiscovery, { SwarmOptions as DiscoveryOptions } from "./hyperdiscovery";
import TCPTransport from "./tcp-transport";

export default (swarmOpts: Partial<SwarmOptions>, discoveryOpts: DiscoveryOptions) => ({
  ...swarmOpts,
  introducers: [
    new HyperDiscovery(discoveryOpts)
  ],
  transport: {
    tcp: new TCPTransport(),
  }
});

export {
  TCPTransport,
  HyperDiscovery,
}
