const events = require('events');

class LanDiscovery extends events.EventEmitter {
  constructor(opts) {
    super();
    if (!opts) opts = {};
    this.joined = new Set();
    this.announce = !!opts.announce;
    this.announced = new Map();
    this.self = {};
  }
  
  async join(discoveryKey, opts) {
    const key = discoveryKey.toString('hex');
    if (this.joined.has(key)) {
      return;
    }
    this.joined.add(key);

    const services = browser.ServiceDiscovery.discover({
      type: 'dat',
      protocol: 'tcp',
    });
    for await (const service of services) {
      if (!this.joined.has(key)) {
        break;
      }
      if (service.host === this.self.host && service.port === this.self.port) {
        // don't connect to self
        continue;
      }
      if (service.name.substring(0, 30) === key.substring(0, 30) && !service.lost) {
        this.emit('peer', {
          id: `${service.host}:${service.port}`,
          host: service.host,
          port: service.port,
          channel: discoveryKey,
          type: 'tcp',
        });
      }
    }
    
    if (this.announce && opts.transport.tcp.port && !this.announced.has(key)) {
      const discovery = browser.ServiceDiscovery.announce({
        name: key,
        type: 'dat',
        protocol: 'tcp',
        port: opts.transport.tcp.port,
      });
      discovery.then((service) => {
        this.self.host = service.host;
        this.self.port = service.port;
        this.announced.set(key, service);
        console.log('announced service', service);
      });
    }
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
}

module.exports = LanDiscovery;
