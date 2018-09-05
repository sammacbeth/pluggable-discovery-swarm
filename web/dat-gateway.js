const Websocket = require('websocket-stream');
const events = require('events')

class DatGatewayIntroducer extends events.EventEmitter {
  constructor(servers) {
    super();
    this.gateways = servers;
  }

  join(discoveryKey, opts) {
    if (opts.key) {
      this.gateways.forEach((gateway) => {
        const gatewayUrl = `${gateway}/${opts.key.toString('hex')}`;
        const peer = {
          id: gatewayUrl,
          channel: discoveryKey,
          retries: 0,
          stream: () => Websocket(gatewayUrl),
        }
        this.emit('peer', peer);
      })
    }
  }

  leave() {}
}

module.exports = DatGatewayIntroducer;