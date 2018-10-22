import { SwarmOptions } from "@sammacbeth/discovery-swarm";
import * as datDefaults from "dat-swarm-defaults";
import HyperDiscovery, { SwarmOptions as DiscoveryOptions } from "./hyperdiscovery";
import DiscoveryChannel from "./discovery-channel";
import TCPTransport from "./tcp-transport";

export default (swarmOpts: Partial<SwarmOptions>, discoveryOpts: DiscoveryOptions) => {
  return {
    ...swarmOpts,
    introducers: [
      new HyperDiscovery(discoveryOpts),
      new DiscoveryChannel(datDefaults({})),
    ],
    transport: {
      tcp: new TCPTransport(),
    }
  };
};

export {
  TCPTransport,
  HyperDiscovery,
}
