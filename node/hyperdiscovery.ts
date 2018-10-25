import { EventEmitter } from "events";
import { Socket } from "net";
import { Introducer, JoinOptions, Peer } from "@sammacbeth/discovery-swarm";
import * as Discovery from "@hyperswarm/discovery";

export interface SwarmOptions {
  bootstrap?: string[]
  ephemeral?: boolean
  socket?: Socket
  announce?: boolean
}

interface Topic extends EventEmitter {
  destroy: () => void
  update: () => void
}

export default class HyperDiscovery extends EventEmitter implements Introducer {

  network: Discovery
  topics: Map<string, Topic>
  announce: boolean

  constructor(opts?: SwarmOptions) {
    super();
    this.network = Discovery(opts);
    this.announce = !!opts.announce;
    this.topics = new Map();
  }

  join(discoveryKey: Buffer, opts?: Partial<JoinOptions>) {
    const key = discoveryKey.toString('hex');
    if (!this.topics.has(key)) {
      let topic : Topic;
      if (this.announce || (opts && opts.announce)) {
        topic = this.network.announce(discoveryKey, {
          port: opts.transport.tcp.address,
        });
      } else {
        topic = this.network.lookup(discoveryKey);
      }
      topic.on('peer', (peer) => {
        const peerInfo : Peer = {
          id: `${peer.host}:${peer.port}`,
          host: peer.host,
          port: peer.port,
          channel: peer.topic,
          type: 'tcp',
        };
        this.emit('peer', peerInfo);
        this.network.holepunch(peer);
      });
      this.topics.set(key, topic);
    }
  }

  leave(discoveryKey: Buffer) {
    const key = discoveryKey.toString('hex');
    if (this.topics.has(key)) {
      const topic = this.topics.get(key);
      topic.destroy();
      this.topics.delete(key);
    }
  }

}