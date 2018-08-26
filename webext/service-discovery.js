const events = require('events');

class DiscoveryIntroducer extends events.EventEmitter {
  constructor() {
    super();
    this.joined = new Set();
  }
  
  async join(discoveryKey) {
    const key = discoveryKey.toString('hex');
    if (this.joined.has(key)) {
      return;
    }
    this.joined.add(key);

    const services = browser.ServiceDiscovery.discover({
      type: "dat",
      protocol: "tcp"
    });
    for await (const service of services) {
      if (!this.joined.has(key)) {
        break;
      }
      if (service.name.startsWith(key) && !service.lost) {
        this.emit('peer', {
          id: `${service.host}:${service.port}`,
          host: service.host,
          port: service.port,
          channel: discoveryKey,
        });
      }
    }
  }

  leave(key) {
    this.joined.delete(key.toString('hex'));
  }
}

class DiscoveryAnnouncer extends events.EventEmitter {
  constructor() {
    super();
    this.announced = new Map();
  }

  join(discoveryKey, opts) {
    const key = discoveryKey.toString('hex');
    if (opts.transport.tcp.port && !this.announced.has(key)) {
      const discovery = browser.ServiceDiscovery.announce({
        name: key,
        type: 'dat',
        protocol: 'tcp',
        port: opts.transport.tcp.port,
      });
      this.announced.set(key, discovery);
      discovery.then(() => {
        console.log('announced service', discovery);
      });
    }
  }

  async leave(discoveryKey) {
    const key = discoveryKey.toString('hex');
    const discovery = await this.announced.get(key);
    if (discovery) {
      discovery.expire();
    }
    this.announced.delete(key);
  }
}

module.exports = {
  DiscoveryIntroducer,
  DiscoveryAnnouncer,
};
