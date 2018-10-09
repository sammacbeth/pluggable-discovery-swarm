const events = require('events');
const Peer = require('simple-peer');

class WebRTCTransport extends events.EventEmitter {
  constructor(opts) {
    super();
    this._peer = null;
  }

  listen() {
    return new Promise((resolve) => {
      const peer = this._peer = new Peer({ initiator: true, trickle: false });
      peer.once('signal', (offer) => {
        resolve({
          offer,
          close: () => {
            peer.destroy();
          }
        });
      });
      peer.on('connect', () => {
        console.log('init connect');
        this.emit('connection', {
          id: `test`,
          stream: () => peer,
        });
      })
    });
  }

  async connect({ offer }) {
    const peer = new Peer({ trickle: false });
    console.log('xxx conn', offer);
    peer.on('signal', (s) => {
      this.emit('signal', s);
    });
    peer.signal(offer);
    await new Promise(resolve => peer.on('connect', resolve));
    console.log('xxx connected');
    return peer;
  }
}

module.exports = WebRTCTransport;