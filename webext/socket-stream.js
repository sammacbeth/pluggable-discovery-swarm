const events = require('events')
const { Duplex } = require('readable-stream');

class Stream extends Duplex {
  constructor(socket) {
    super();
    this._socket = socket;
    this._buffer = [];
    this.on('finish', () => {
      console.log('socket finish')
      this._socket.close();
    });
    this._run();
  }

  async _run() {
    if (this._flowing) {
      return;
    }
    this._flowing = true;
    while (this._socket.readyState === 'open') {
      const data = await this._socket.read();
      if (this.ended) {
        break;
      }
      this.push(Buffer.from(data));
    }
    this._flowing = false;
  }

  _read() {
  }

  write(chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      const encoder = new TextEncoder(encoding || this._encoding);
      chunk = encoder.encode(chunk);
    }
    const write = this._socket.write(chunk.buffer);
    if (callback) {
      write.then(() => callback(null), (err) => callback(err));
    }
    return true;
  }

  _destroy(err, cb) {
    console.log('socket destroy', err);
    this._socket.close();
    cb(err);
  }
}

module.exports = Stream;