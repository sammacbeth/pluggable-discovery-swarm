import { EventEmitter } from "events";
import { createServer, createConnection } from "net";
import { Transport, Server } from "@sammacbeth/discovery-swarm-ts";
import { Duplex } from "stream";

export default class TCPTransport extends EventEmitter implements Transport {
  
  port: number

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
        })
      });
      this.port = port;
      server.listen(port);
      resolve({
        port,
        close: () => server.close()
      });
    });
  }

  connect({ host, port }) : Promise<Duplex> {
    return Promise.resolve(createConnection(port, host));
  }
}