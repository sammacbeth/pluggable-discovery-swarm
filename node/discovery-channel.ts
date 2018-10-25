import * as DC from "discovery-channel";
import { EventEmitter } from "events";
import { Introducer, JoinOptions, Peer } from "@sammacbeth/discovery-swarm";

export interface DiscoveryOptions {
  dns?: boolean
  dht?: boolean
  hash?: (any) => any
}

export default class DiscoveryChannel extends EventEmitter implements Introducer {

  channel: DC

  constructor(opts?: DiscoveryOptions) {
    super();
    this.channel = DC({
      hash: false,
      ...opts
    });
    this.channel.on('peer', (id: Buffer, peer) => {
      this.emit('peer', {
        id: `${peer.host}:${peer.port}`,
        host: peer.host,
        port: peer.port,
        channel: id || peer.channel,
        type: 'tcp',
      });
    });
  }

  join(discoveryKey: Buffer, opts?: Partial<JoinOptions>) {
    console.log('join', discoveryKey.toString('hex'));
    if (opts.announce) {
      this.channel.join(discoveryKey, opts.transport.tcp.address);
    } else {
      this.channel.join(discoveryKey);
    }
  }

  leave(discoveryKey: Buffer) {
    this.channel.leave(discoveryKey);
  }
}
