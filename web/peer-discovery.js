const events = require('events');

class PeerDiscovery extends events.EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.joined = new Map();
  }

  async join(discoveryKey, opts) {
    const key = discoveryKey.toString('hex');
    if (this.joined.has(key)) {
      return;
    }

    const fetchAndEmit = async () => this._emitPeers(discoveryKey, await this._fetchPeers(discoveryKey));
    this.joined.set(key, setInterval(fetchAndEmit, 60000))
    fetchAndEmit();
  }

  _fetchPeers(discoveryKey) {
    const key = discoveryKey.toString('hex');
    return fetch(`${this.server}/${key}`)
    .then(res => res.json())
  }

  _emitPeers (channel, peers) {
    peers.forEach((peer) => {
      const [host, port] = peer.split(':');
      this.emit('peer', {
        id: peer,
        host,
        port: parseInt(port),
        channel,
        type: 'tcp',
        retries: 4,
      });
    });
  }

  leave(discoveryKey) {
    const key = discoveryKey.toString('hex');
    clearInterval(this.joined.get(key));
    this.joined.delete(key);
  }
}

module.exports = PeerDiscovery;
