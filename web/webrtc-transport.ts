import { EventEmitter } from "events";
import * as SimplePeer from "simple-peer";
import * as Signalhub from "signalhub";
import { Transport, Server, Peer } from "@sammacbeth/discovery-swarm";
import { Readable, Duplex } from "stream";
import { randomBytes } from "crypto";

export default class WebRTCTransport extends EventEmitter implements Transport {

  hub: Signalhub
  peerOpts: any
  address: string

  constructor(servers, peerOpts) {
    super();
    this.hub = Signalhub('dat-webrtc', servers);
    this.peerOpts = peerOpts;
  }

  listen(port: number, id: Buffer): Promise<Server> {
    this.address = id.toString('hex');
    return new Promise((resolve) => {
      const stream: Readable = this.hub.subscribe(this.address);
      console.log('listening to ', this.address);
      stream.on('data', async (message) => {
        if (message.id === this.address) {
          return;
        }
        if (message.type === 'offer') {
          console.log('got offer', message.id);
          const peer = new SimplePeer({ initiator: false, ...this.peerOpts });
          peer.once('signal', (signal) => {
            this.hub.broadcast(this.address, {
              id: this.address,
              type: 'signal',
              target: message.id,
              signal,
            });
          });
          peer.signal(message.offer);
          const timeout = new Promise((resolve, reject) => setTimeout(reject, 10000));
          const connection = new Promise(resolve => peer.once('connect', resolve));
          try {
            await Promise.race([timeout, connection]);
            console.log('connected', message.id);
            this.emit('connection', {
              id: message.id,
              stream: () => peer,
            });
          } catch (e) {
            // timeout
          }
        }
      });
      resolve({
        close: () => this.hub.close(),
      });
    });
  }

  async connect({ id }: Peer): Promise<Duplex> {
    // TODO host can indicate different signal server
    const myId = this.address || randomBytes(32).toString('hex');
    const stream: Readable = this.hub.subscribe(id);
    // create peer and broadcast offer to peer
    const peer = new SimplePeer({ initiator: true, ...this.peerOpts });
    peer.once('signal', (offer) => {
      console.log('offer', id);
      this.hub.broadcast(id, {
        id: myId,
        type: 'offer',
        offer,
      });
    });

    // wait for response from signal server
    stream.on('data', (message) => {
      if (message.id === myId || message.target !== myId || message.type !== 'signal') {
        return;
      }
      console.log('got signal', message.id);
      peer.signal(message.signal);
    });

    const connection = new Promise((resolve) => peer.once('connect', resolve));
    const timeout = new Promise((resolve, reject) => setTimeout(reject, 10000));
    try {
      await Promise.race([timeout, connection]);
    } catch (e) {
      throw new Error('connection timeout')
    } finally {
      stream.destroy();
    }
    console.log('connected', id);
    return peer;
  }
}
