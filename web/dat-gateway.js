const Websocket = require('websocket-stream');
const events = require('events')

class DatGatewayIntroducer extends events.EventEmitter {
  constructor(server, multiplexStream = false) {
    super();
    this.gateway = server;
    this.multiplexStream = multiplexStream;
  }

  async join(discoveryKey, opts) {
    if (opts.key) {
      const gatewayUrl = `${this.gateway}/${opts.key.toString('hex')}`;
      const peer = {
        id: this.multiplexStream ? this.gateway : gatewayUrl,
        channel: discoveryKey,
        retries: 0,
        stream: () => Websocket(gatewayUrl),
      }
      if (this.multiplexStream) {
        // ping gateway to load feed
        await fetch(`${gatewayUrl.replace('ws:', 'http:').replace('wss:', 'https')}/`, {
          credentials: 'omit',
          method: 'HEAD',
        });
      }
      this.emit('peer', peer);
    }
  }

  leave() {}
}

module.exports = DatGatewayIntroducer;