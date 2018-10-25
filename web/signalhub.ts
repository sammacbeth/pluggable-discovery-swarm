import { randomBytes } from "crypto";
import * as Peer from "simple-peer";
import * as Signalhub from "signalhub";
import { Introducer, JoinOptions } from "@sammacbeth/discovery-swarm";
import { EventEmitter } from "events";
import { Stream, Readable } from "stream";


export default class SignalHubIntroducer extends EventEmitter implements Introducer {

  signalhub: Signalhub
  _streams: Map<string, Readable>
  _offers: Map<string, Peer>
  _connections: Set<string>
  peerOpts: any

  constructor(servers: string[], peerOpts) {
    super();
    this.signalhub = Signalhub('dat-discovery', servers);
    this._streams = new Map();
    this._offers = new Map();
    this._connections = new Set();
    this.peerOpts = peerOpts;
  }

  join(discoveryKey: Buffer, opts: JoinOptions) {
    const key = discoveryKey.toString('hex');
    const myId = opts.id.toString('hex');
    if (this._streams.has(key)) {
      return;
    }
    const stream: Readable = this.signalhub.subscribe(key);
    stream.on('data', (message) => {
      console.log('message', message);
      if (message.id === myId) {
        return
      }
      if (message.type === 'offer' && !this._connections.has(message.id)) {
        console.log('saw offer');
        this.emit('peer', {
          id: message.id,
          channel: discoveryKey,
          type: 'webrtc',
          stream: async () => {
            console.log('connect peer', message.id);
            const peer = new Peer({ initiator: false, ...this.peerOpts });
            peer.once('signal', (signal) => {
              console.log('braodcast signal');
              this.signalhub.broadcast(key, {
                id: myId,
                type: 'signal',
                target: message.id,
                signal,
              });
            })
            peer.signal(message.offer);
            const timeout = new Promise((resolve, reject) => setTimeout(reject, 10000));
            const connection = new Promise(resolve => peer.once('connect', resolve));
            await Promise.race([timeout, connection]);
            console.log('xxx connected');
            this._connections.add(message.id);
            peer.on('close', () => this._connections.delete(message.id));
            return peer;
          }
        })
      } else if (message.type === 'signal' && message.target === myId) {
        console.log('saw signal from', message.id);
        // offer response signal
        if (!this._offers.has(key)) {
          return;
        }
        const peer = this._offers.get(key);
        peer.signal(message.signal);
        peer.on('connect', () => {
          console.log('connected');
          this.emit('peer', {
            id: message.id,
            stream: () => peer,
          });
          this._connections.add(message.id);
          peer.on('close', () => this._connections.delete(message.id));
        });
        // broadcast a new offer
        this.broadcastOffer(key, myId);
      }
    });
    this._streams.set(key, stream);

    if (opts.announce) {
      this.broadcastOffer(key, myId);
    }
  }

  broadcastOffer(key: string, peerId: string) {
    const peer = new Peer({ initiator: true, ...this.peerOpts });
    this._offers.set(key, peer);
    peer.once('signal', (offer) => {
      console.log('broadcast', peerId, offer);
      this.signalhub.broadcast(key, {
        id: peerId,
        type: 'offer',
        offer,
      })
    });
  }

  leave(discoveryKey: Buffer) {
    const key = discoveryKey.toString('hex');
    if (this._streams.has(key)) {
      this._streams.get(key).destroy();
      this._streams.delete(key);
    }
    if (this._offers.has(key)) {
      this._offers.get(key).destroy();
      this._offers.delete(key);
    }
  }

}