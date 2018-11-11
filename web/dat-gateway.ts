import { EventEmitter } from "events";
import * as Websocket from "websocket-stream";


export default class DatGatewayIntroducer extends EventEmitter {

  gateway: string
  multiplexStream: boolean

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
        retries: 1,
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
