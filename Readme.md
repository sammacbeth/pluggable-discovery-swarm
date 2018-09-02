# Pluggable-discovery-swarm

A pluggable implementation of [discovery-swarm](https://github.com/mafintosh/discovery-swarm).
Enables multiple different _introductors_, _announcers_ and _transports_ to be specified at runtime
and used to discover and connect to peers.

Currently implements:
 * Dat Gateway introducer: peers with [dat-gateway] servers over Websockets (web + node).
 * TCP Transport for webextensions: Connect with peers over TCP, using [libdweb] (webextensions).
 * LanDiscovery: Announce and discover peers on LAN, using [libdweb] (webextensions).

## Usage

```javascript
const Swarm = require('discovery-swarm');
const DatGatewayIntroducer = require('discovery-swarm/web/dat-gateway');
const TCPTransport = require('discovery-swarm/webext/tcp-transport');
const LanDiscovery = require('discovery-swarm/webext/service-discovery');

const swarm = new Swarm({
  introducers: [
    new DatGatewayIntroducer(),
    new LanDiscovery({ announce: true }),
  ],
  transport: {
    tcp: new TCPTransport(),
  },
});
swarm.listen();
swarm.join(key);
swarm.on('peer', (peer) => {
  console.log('got a peer', peer);
});
```

## License

MIT.
