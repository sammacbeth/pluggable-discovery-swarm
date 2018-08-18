const events = require('events')
const crypto = require('crypto')
const Websocket = require('websocket-stream');
const pump = require('pump');

const RECONNECT_WAIT = [1000, 1000, 5000, 15000]

class Swarm extends events.EventEmitter {
  constructor(opts) {
    super();
    console.log('swarm', opts);
    if (!opts) opts = {};

    this.id = opts.id || crypto.randomBytes(32);

    this.maxConnections = opts.maxConnections || 0;
    this.totalConnections = 0;

    this._stream = opts.stream;
    this._options = opts;
    this._listening = false;

    this._joined = new Set();
    this._peers = new Map();
    this.connections = new Map();

    this.on('peer', this.onPeer.bind(this));
  }

  close(onclose) {
    return this.destroy(onclose);
  }

  destroy(onclose) {

  }

  get queued() {
    return 0;
  }

  get connecting() {
    return this.totalConnections - this.connected;
  }

  get connected() {
    return this.connections.size;
  }  

  join(name, opts, cb) {
    console.log('swarm join', name, opts, this._options);
    opts = Object.assign(opts, this._options);
    const discoveryKey = name.toString('hex');
    if (this._joined.has(discoveryKey)) {
      // already joined
      return
    }
    this._joined.add(discoveryKey);

    // look for gateway peers immediately
    if (opts.key && this._stream && opts.gateway && opts.gateway.length > 0) {
      const gatewayUrl = `${opts.gateway[0]}/${opts.key.toString('hex')}`;
      const peer = {
        id: gatewayUrl,
        channel: name,
        retries: 0,
        stream: () => Websocket(gatewayUrl),
      }
      this.emit('peer', peer);
    }
  }

  leave(name) {
    const key = name.toString('hex');
    this._joined.delete(key);
    for (const [id, peer] of this._peers.entries()) {
      if (peer.channel.toString('hex') === key) {
        if (this.connections.has(id)) {
          this.connections.get(id).destroy();
        }
        this._peers.delete(id);
      }
    }
  }

  listen(port, onlistening) {

  }

  onPeer(peer) {
    console.log('onPeer', peer);
    if (this._peers.has(peer.id) || peer.id === this.id) {
      // already connected, or self
      return;
    }
    if (this.maxConnections > 0 && this.totalConnections >= this.maxConnections) {
      return;
    }
    if (peer.channel && !this._joined.has(peer.channel.toString('hex'))) {
      // not listening to this key
      return;
    }

    this._peers.set(peer.id, peer);

    if (peer.stream && this._stream) {
      const connectPeer = () => {
        const peerStream = peer.stream();
        const connection = pump(peerStream, this._stream(peer), peerStream, (err) => {
          console.error('stream error', err);
          this.connections.delete(peer.id)
          if (peer.retries < RECONNECT_WAIT.length && this._peers.has(peer.id)) {
            setTimeout(connectPeer, RECONNECT_WAIT[peer.retries]);
            peer.retries += 1;
          } else {
            this.totalConnections -= 1;
          }
        });
        this.connections.set(peer.id, connection);
      }
      connectPeer();
      this.totalConnections += 1;
    } 
  }

}

module.exports = (...args) => new Swarm(...args);
