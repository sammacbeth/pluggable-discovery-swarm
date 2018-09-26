const events = require('events');
const crypto = require('crypto');

class LanDiscovery extends events.EventEmitter {
  constructor(opts) {
    super();
    if (!opts) opts = {};
    this.id = opts.id || crypto.randomBytes(32);
    this.joined = new Set();
    this.announce = !!opts.announce;
    this.announced = new Map();
    this.self = {};
    this.discoveryRunning = false;
  }

  async join(discoveryKey, opts) {
    const key = discoveryKey.toString('hex');
    if (this.joined.has(key)) {
      return;
    }
    this.joined.add(key);

    if (this.announce && opts.transport.tcp.port && !this.announced.has(key)) {
      const discovery = browser.ServiceDiscovery.announce({
        name: key,
        type: 'dat',
        protocol: 'tcp',
        port: opts.transport.tcp.port,
        attributes: {
          peerId: this.id.toString('hex'),
        }
      });
      discovery.then((service) => {
        this.self.host = service.host;
        this.self.port = service.port;
        this.announced.set(key, service);
        console.log('announced service', service);
      });
    }
    this.runDiscovery();
  }

  leave(discoveryKey) {
    const key = discoveryKey.toString('hex');
    this.joined.delete(key);
    if (this.announced.has(key)) {
      const discovery = this.announced.get(key);
      if (discovery) {
        discovery.expire();
      }
      this.announced.delete(key);
    }
  }

  async runDiscovery() {
    if (this.discoveryRunning) {
      return;
    }
    this.discoveryRunning = true;
    const services = browser.ServiceDiscovery.discover({
      type: 'dat',
      protocol: 'tcp',
    });
    for await (const service of services) {
      if (!this.joined.size === 0) {
        break;
      }
      if ((service.host === this.self.host && service.port === this.self.port) ||
        service.attributes.peerId === this.id.toString('hex')) {
        // don't connect to self
        continue;
      }
      if (service.lost) {
        continue;
      }
      [...this.joined]
      .filter(key => key.substring(0, 30) === service.name.substring(0, 30))
      .forEach((key) => {
        this.emit('peer', {
          id: `${service.host}:${service.port}`,
          host: service.host,
          port: service.port,
          channel: Buffer.from(key, 'hex'),
          type: 'tcp',
          retries: 2,
        });
      });
    }
    this.discoveryRunning = false;
  }
}

module.exports = LanDiscovery;
