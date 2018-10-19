import * as hyperdrive from 'hyperdrive';
import * as ram from 'random-access-memory';

import HyperDiscovery from "./hyperdiscovery";
import TCPTransport from "./tcp-transport";

const archive = hyperdrive(ram);
archive.on('ready', () => {
  const network1 = new HyperDiscovery({
    announce: true,
  });
  const mockTransport = new TCPTransport();
  mockTransport.port = 1234;
  const network2 = new HyperDiscovery({});
  // network1.on('peer', console.log);
  network2.on('peer', console.log);
  network1.join(archive.key, {
    transport: {
      tcp: mockTransport,
    }
  });
  network2.join(archive.key);
});

