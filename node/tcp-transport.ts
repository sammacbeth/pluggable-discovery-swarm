import { EventEmitter } from "events";
import { createServer, connect } from "net";
import { Transport, Server, Peer } from "@sammacbeth/discovery-swarm";
import { Duplex } from "stream";

export default class TCPTransport extends EventEmitter implements Transport {

  address: number

  constructor() {
    super();
  }

  listen(port: number) : Promise<Server> {
    return new Promise((resolve) => {
      const server = createServer((socket) => {
        this.emit('connection', {
          id: `${socket.remoteAddress}:${socket.remotePort}`,
          host: socket.remoteAddress,
          port: socket.remotePort,
          stream: () => socket,
        });
      });
      this.address = port;
      server.listen(port, () => {
        resolve({
          close: () => server.close()
        });
      });
    });
  }

  connect({ host, port }: Peer) : Promise<Duplex> {
    return new Promise((resolve) => {
      const socket = connect(port, host, () => {
        resolve(socket);
        console.log('connected', host, port);
      });
      socket.on('error', (e) => {
        console.error('error', e);
        socket.destroy();
      });
    });
  }
}