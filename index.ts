import { Stream, Duplex } from "stream";
import { EventEmitter } from "events";
import { randomBytes } from "crypto";
import * as pump from "pump";
import * as hypercoreProtocol from 'hypercore-protocol';

const RECONNECT_WAIT = [1000, 1000, 5000, 15000]

export interface TransportMap {
  [type: string]: Transport
}

export interface JoinOptions {
  id: Buffer
  announce: boolean
  transport: TransportMap
  key?: Buffer
}

export interface SwarmOptions extends JoinOptions {
  debug: boolean
  maxConnections: number
  stream: (peer: Peer) => Duplex
  introducers: Introducer[]
  transport: TransportMap
}

export interface Introducer extends EventEmitter {
  join(key: Buffer, opts?: Partial<JoinOptions>)
  leave(key: Buffer)
}

export interface Server {
  port: number
  close: () => void
}

export interface Address {
  host: string
  port: number
}

export interface Transport extends EventEmitter {
  listen(port?: number) : Promise<Server>
  connect(address: Address) : Promise<Duplex>
  port?: number
}

export interface Peer extends Partial<Address> {
  id: string
  channel?: Buffer
  connection?: Duplex
  replStream?: Duplex
  retries?: number
  stream?: () => Promise<Duplex>
  type?: string
}

export class Swarm extends EventEmitter {

  debug: boolean
  id: Buffer
  maxConnections: number
  totalConnections: number
  introducers: Introducer[]
  _joined: Set<string>
  _options: Partial<SwarmOptions>
  _stream?: (peer: Peer) => Duplex
  _peers: Map<string, Peer>
  _onPeer: (peer: Peer) => void
  _servers: Map<string, Server>

  constructor(opts?: Partial<SwarmOptions>) {
    super();
    if (!opts) opts = {};
    this.debug = opts.debug;
    this.id = opts.id || randomBytes(32);

    this.maxConnections = opts.maxConnections || 0;
    this.totalConnections = 0;

    this._stream = opts.stream;
    this._options = opts;

    this._joined = new Set();
    this._peers = new Map();

    this._onPeer = this.onPeer.bind(this);
    this.introducers = opts.introducers || [];
    this.introducers.forEach((introducer) => {
      introducer.on('peer', this._onPeer);
    });
    this._servers = new Map();

    this.on('peer', this.onPeer.bind(this));
  }

  close() {
    return this.destroy();
  }

  destroy() {
    this.introducers.forEach((introducer) => {
      introducer.removeListener('peer', this._onPeer);
    });
    this._joined.forEach((key) => {
      this.leave(Buffer.from(key, 'hex'));
    });
    this._servers.forEach((server, type) => {
      server.close();
      this._options.transport[type].removeListener('connection', this._onPeer);
    });
  }

  get queued(): number {
    return 0;
  }

  get connecting(): number {
    return this.totalConnections - this.connected;
  }

  get connected(): number {
    return this._peers.size;
  }

  join(name: Buffer, opts: Partial<SwarmOptions>) {
    opts = Object.assign(opts, this._options);
    const discoveryKey = name.toString('hex');
    if (this._joined.has(discoveryKey)) {
      // already joined
      return
    }
    this._joined.add(discoveryKey);

    // ask introducers for peers
    this.introducers.forEach((introducer) => {
      introducer.join(name, opts);
    });
  }

  leave(name: Buffer) {
    const key = name.toString('hex');
    this._joined.delete(key);
    for (const [id, peer] of this._peers.entries()) {
      if (peer.channel && peer.channel.toString('hex') === key) {
        if (peer.connection) {
          peer.connection.destroy();
        }
        this._peers.delete(id);
      }
    }

    this.introducers.forEach((introducer) => {
      introducer.leave(name);
    });
  }

  async listen(port?: number, onlistening?: () => void) {
    if (this._options.transport) {
      await Promise.all(Object.keys(this._options.transport).map((name) => {
        return this._options.transport[name].listen(port).then((server) => {
          if (this.debug) {
            console.log(`${name} server listening on ${server.port}`);
          }
          this._servers.set(name, server);
          this._options.transport[name].port = server.port;
          this._options.transport[name].on('connection', this._onPeer);
        });
      }));
    }
    onlistening && onlistening();
  }

  onPeer(peer: Peer) {
    if (this.debug) {
      console.log('peer', peer);
    }
    if (this._peers.has(peer.id)) {
      // already connected, or self
      const existingPeer = this._peers.get(peer.id);
      if (existingPeer.connection && existingPeer.replStream) {
        // already connected - emit the channel
        existingPeer.replStream.emit('feed', peer.channel)
      } else if (peer.retries === 0) {
        return;
      }
    }
    if (this.maxConnections > 0 && this.totalConnections >= this.maxConnections) {
      return;
    }
    if (peer.channel && !this._joined.has(peer.channel.toString('hex'))) {
      // not listening to this key
      return;
    }

    this._peers.set(peer.id, peer);
    // when peer stream is not provided by the discoverer, find a transport that can make the connection
    if (!peer.stream && peer.type && this._options.transport[peer.type]) {
      const address: Address = {
        host: peer.host,
        port: peer.port,
      };
      peer.stream = async () => {
        return await this._options.transport[peer.type].connect(address);
      };
    }
    peer.retries = peer.retries || 4;

    if (peer.stream && this._stream) {
      const connectPeer = async () => {
        const peerStream = await peer.stream();
        this.totalConnections += 1;
        const replStream = this._stream(peer);
        peer.replStream = replStream;
        peer.connection = pump(peerStream, replStream, peerStream, (err) => {
          if (this.debug) {
            console.error('stream error', err);
          }
          peer.connection = null;
          peer.replStream = null;
          if (peer.retries < RECONNECT_WAIT.length && this._peers.has(peer.id)) {
            setTimeout(connectPeer, RECONNECT_WAIT[peer.retries]);
            peer.retries += 1;
          } else {
            // TODO temp ban?
            this.totalConnections -= 1;
          }
        });
        peerStream.on('end', () => {
          peer.connection = null;
        });
        if (this.debug) {
          replStream.on('handshake', () => console.log('handshaked', peer.id));
          replStream.on('feed', (f) => console.log('feed', peer.id, f.toString('hex')));
          peerStream.on('close', () => console.log('stream closed'));
          peerStream.on('error', (err) => console.error('stream error', peer.id, err));
          replStream.on('error', (err) => console.error('repl error', peer.id, err));
        }
      }
      connectPeer();
    }
  }
}

interface ReplicationOptions {
  live?: boolean
  stream?: Duplex
}

export interface HypercoreLike {
  key: Buffer
  discoveryKey: Buffer
  replicate: (opts?: ReplicationOptions) => Duplex
  ready: (callback: () => void) => void
}

export class MultiSwarm {

  swarm: Swarm
  archives: Map<string, HypercoreLike>

  constructor(opts?: Partial<SwarmOptions>) {
    this.swarm = new Swarm(Object.assign({
      hash: false,
      stream: this.replicate.bind(this),
    }, opts));
    this.archives = new Map();
  }

  listen(port?: number) {
    return this.swarm.listen(port);
  }

  add(archive: HypercoreLike) {
    archive.ready(() => {
      const key = archive.discoveryKey.toString('hex');
      this.archives.set(key, archive);
      this.swarm.join(archive.discoveryKey, {
        key: archive.key,
      });
    });
  }

  remove(archive: HypercoreLike) {
    const key = archive.discoveryKey.toString('hex');
    this.archives.delete(key);
    this.swarm.leave(archive.discoveryKey);
  }

  replicate(opts: Peer) : Duplex {
    const stream: Duplex = hypercoreProtocol({
      live: true,
      id: this.swarm.id,
      encrypt: true
    });

    const add = (dk: Buffer) => {
      const key = dk.toString('hex');
      console.log('feed', key);
      if (!this.archives.has(key)) {
        return;
      }
      const archive = this.archives.get(key);
      archive.replicate({
        live: true,
        stream,
      });
    };

    stream.on('feed', add);
    if (opts.channel) {
      add(opts.channel);
    }

    return stream;
  }

  destroy() {
    this.swarm.destroy();
  }
}

export default (...args) => new Swarm(...args);