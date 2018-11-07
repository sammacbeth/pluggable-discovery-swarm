import { EventEmitter } from "events";
import { Introducer, JoinOptions } from "@sammacbeth/discovery-swarm";

function parsePeer(peer: string) {
  if (peer.startsWith('wrtc://')) {
    const [host, id] = peer.substring(7).split('/');
    return {
      id,
      host,
      type: 'webrtc',
    };
  } else if (peer.startsWith('tcp://')) {
    const host = peer.substring(6, peer.lastIndexOf(':'));
    const port = peer.substring(host.length + 7);
    return {
      id: peer,
      host,
      port: parseInt(port),
      type: 'tcp',
    };
  }
  throw Error(`Unknown protocol ${peer}`);
}

export default class PeerDiscovery extends EventEmitter implements Introducer {

  server: string
  joined: Map<string, any>
  self: Set<string>

  constructor(server) {
    super();
    this.server = server;
    this.joined = new Map();
    this.self = new Set();
  }

  async join(discoveryKey: Buffer, opts: JoinOptions) {
    const key = discoveryKey.toString('hex');
    if (this.joined.has(key)) {
      return;
    }

    const fetchAndEmit = async () => this._emitPeers(discoveryKey, await this._fetchPeers(discoveryKey));
    this.joined.set(key, setInterval(fetchAndEmit, 60000))
    fetchAndEmit();

    if (opts.announce && opts.transport) {
      const wrtc = opts.transport.webrtc ? `${opts.transport.webrtc.address}/${opts.id.toString('hex')}` : false;
      const tcp = opts.transport.tcp ? opts.transport.tcp.address : false;
      const announceResponse = await fetch(`${this.server}/${key}`, {
        method: 'POST',
        body: JSON.stringify({ wrtc, tcp }),
      });
      const addresses = await announceResponse.json();
      Object.values(addresses).forEach((addr: string) => {
        if (addr) {
          this.self.add(addr);
        }
      });
    }
  }

  _fetchPeers(discoveryKey) {
    const key = discoveryKey.toString('hex');
    return fetch(`${this.server}/${key}`)
    .then(res => res.json())
  }

  _emitPeers (channel, peers) {
    peers.forEach((peer) => {
      try {
        const peerInfo = parsePeer(peer);
        this.emit('peer', {
          ...peerInfo,
          channel,
        });
      } catch (e) {
        console.warn('Got invalid peer', e);
      }
    });
  }

  leave(discoveryKey) {
    const key = discoveryKey.toString('hex');
    clearInterval(this.joined.get(key));
    this.joined.delete(key);
  }
}
