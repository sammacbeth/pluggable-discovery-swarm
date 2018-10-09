const events = require('events')
const crypto = require('crypto')
const pump = require('pump');

const RECONNECT_WAIT = [1000, 1000, 5000, 15000]

class Swarm extends events.EventEmitter {
  constructor(opts) {
    super();
    if (!opts) opts = {};
    this.debug = opts.debug;
    this.id = opts.id || crypto.randomBytes(32);

    this.maxConnections = opts.maxConnections || 0;
    this.totalConnections = 0;

    this._stream = opts.stream;
    this._options = opts;
    this._listening = false;

    this._joined = new Set();
    this._peers = new Map();

    this._onPeer = this.onPeer.bind(this);
    this.introducers = opts.introducers || [];
    this.introducers.forEach((introducer) => {
      introducer.on('peer', this._onPeer);
    });
    this._servers = {};

    this.on('peer', this.onPeer.bind(this));
  }

  close(onclose) {
    return this.destroy(onclose);
  }

  destroy(onclose) {
    this.introducers.forEach((introducer) => {
      introducer.removeListener('peer', this._onPeer);
    });
    this._joined.forEach((key) => {
      this.leave(Buffer.from(key, 'hex'));
    })
    Object.keys(this._servers).forEach((type) => {
      this._servers[type].close();
      this._options.transport[type].removeListener('connection', this._onPeer);
    });
  }

  get queued() {
    return 0;
  }

  get connecting() {
    return this.totalConnections - this.connected;
  }

  get connected() {
    return this._peers.size;
  }

  join(name, opts, cb) {
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

  leave(name) {
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

  async listen(port, onlistening) {
    if (this._options.transport) {
      await Promise.all(Object.keys(this._options.transport).map((name) => {
        return this._options.transport[name].listen(port).then((server) => {
          if (this.debug) {
            console.log(`${name} server listening on ${server.port}`);
          }
          this._servers[name] = server;
          this._options.transport[name].port = server.port;
          this._options.transport[name].on('connection', this._onPeer);
        });
      }));
    }
    onlistening && onlistening();
  }

  onPeer(peer) {
    if (this.debug) {
      console.log('peer', peer);
    }
    if (peer.id === this.id) {
      return
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
      peer.stream = async () => {
        return await this._options.transport[peer.type].connect(peer);
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

module.exports = (...args) => new Swarm(...args);
