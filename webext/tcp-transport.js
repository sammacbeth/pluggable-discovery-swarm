const events = require('events');
const SocketStream = require('./socket-stream');

class TCPTransport extends events.EventEmitter {
  constructor(TCPSocket) {
    super();
    this.socket = TCPSocket || browser.TCPSocket;
  }

  listen(port) {
    return new Promise((resolve) => {
      this.socket.listen({ port }).then(async (server) => {
        this.address = server.localPort;
        resolve({
          close: () => server.close(),
        });
        for await (const socket of server.connections) {
          console.log('incoming connection from', `${socket.host}:${socket.port}`);
          await socket.opened;
          this.emit('connection', {
            id: `${socket.host}:${socket.port}`,
            host: socket.host,
            port: socket.port,
            stream: () => new SocketStream(socket),
          });
        }
      });
    });
  }

  async connect({ host, port }) {
    console.log('connect to', host, port);
    const socket = await browser.TCPSocket.connect({ host, port })
    await socket.opened;
    return new SocketStream(socket);
  }
}

module.exports = TCPTransport;