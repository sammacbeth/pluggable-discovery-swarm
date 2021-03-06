const mocha = require('mocha').mocha;
const chai = require('chai');

const DatGatewayIntroducer = require('@sammacbeth/discovery-swarm-web/dat-gateway');
const TCPTransport = require('@sammacbeth/discovery-swarm-webext/tcp-transport');
const SignalHubIntroducer = require('@sammacbeth/discovery-swarm-web/signalhub').default;
const WebRTCTransport = require('@sammacbeth/discovery-swarm-web/webrtc-transport').default;
const LanDiscovery = require('@sammacbeth/discovery-swarm-webext/service-discovery');
const { setupNetwork, createHyperDrive, waitForMetadata } = require('./utils');

mocha.setup('bdd');
const expect = chai.expect;

async function testReplicated(archive, testFile = 'dat.json') {
  return new Promise((resolve, reject) => {
    archive.readdir('/', (err, files) => {
      expect(files.length).to.not.equal(0);
      expect(files.indexOf(testFile) !== -1).to.be.true;
      resolve();
    });
  });
}

describe('hyperdrive replication', () => {

  let archive;
  let network;
  const key = 'd116652eca93bc6608f1c09e5fb72b3f654aa3be2a3bca09bccfbe4131ff9e23';

  afterEach(() => {
    if (network) {
      network.destroy();
    }
    if (archive) {
      archive.close();
    }
  });

  context('no network', () => {

    beforeEach(async () => {
      archive = await createHyperDrive(key);
    });

    it('hyperdrive has no data', (done) => {
      archive.readdir('/', (err, files) => {
        expect(files.length).to.equal(0);
        done(err);
      });
    });
  });

  context('gateway replication', () => {

    beforeEach(async () => {
      archive = await createHyperDrive(key);
    });

    it('replicates', async function () {
      this.timeout(5000);
      const gatewayServers = ['ws://gateway.mauve.moe:3000'];
      const opts = {
        sparse: true,
        introducers: [new DatGatewayIntroducer(gatewayServers)],
      };
      network = await setupNetwork(archive, opts);
      await waitForMetadata(archive);

      return testReplicated(archive);
    });
  });

  async function selfReplicationTest(net1, net2, emitPeers) {
    // create a hyperdrive
    archive = await createHyperDrive();

    // setup archive to get full hyperdrive contents
    network = await setupNetwork(archive, net1);

    const data = 'hello world';
    await new Promise((res, rej) => {
      archive.writeFile('test.txt', data, (err) => {
        if (err) {
          rej(err);
        } else {
          res();
        }
      });
    });

    const archive2 = await createHyperDrive(archive.key.toString('hex'));
    const network2 = await setupNetwork(archive2, net2);
    const ready = waitForMetadata(archive2);

    await testReplicated(archive, 'test.txt');

    // get address of network1 server and emit as peer to network2
    emitPeers(network, network2);

    await ready
    await testReplicated(archive2, 'test.txt');
    await new Promise((resolve, reject) => {
      archive2.readFile('/test.txt', 'utf-8', (err, contents) => {
        if (err) reject(err);
        expect(contents).to.equal(data);
        resolve();
      });
    });
  }

  context('TCPSocket replication', () => {

    it('replicates to a dat-node server', async function () {
      this.timeout(5000);

      archive = await createHyperDrive(key);
      const opts = {
        sparse: true,
        transport: {
          tcp: new TCPTransport(),
        },
      };

      network = await setupNetwork(archive, opts);
      setTimeout(() => {
        network.emit('peer', {
          id: 'dat-node',
          host: 'localhost',
          port: 3282,
          type: 'tcp',
          channel: archive.discoveryKey,
          retries: 0,
        });
      }, 10);
      await waitForMetadata(archive);
      return testReplicated(archive);
    });

    it('replicates to itself', function () {
      this.timeout(5000);
      return selfReplicationTest({
        transport: {
          tcp: new TCPTransport(),
        },
      }, {
        sparse: true,
        transport: {
          tcp: new TCPTransport(),
        }
      }, (network, network2) => {
        network2.emit('peer', {
          id: 'network1',
          host: 'localhost',
          port: network._servers.get('tcp').port,
          type: 'tcp',
          channel: archive.discoveryKey,
          retries: 0,
        });
      });
    });
  });

  context('Signalhub Webrtc Replication', () => {

    const signalServers = [
      'https://signal.dat-web.eu',
    ];

    it('replicates to itself', async function () {
      this.timeout(5000);
      const t1 = new SignalHubIntroducer(signalServers, { trickle: false });
      const t2 = new SignalHubIntroducer(signalServers, { trickle: false });
      return selfReplicationTest({
        introducers: [t1],
        transport: {
          webrtc: t1,
        },
      }, {
        sparse: true,
        introducers: [t2],
        transport: {
          webrtc: t2,
        }
      }, () => {
      });
    });

    it('replicates to a node server', async function () {
      this.timeout(5000);

      archive = await createHyperDrive(key);
      const wrtc = new SignalHubIntroducer(signalServers, { trickle: true });
      const opts = {
        debug: true,
        sparse: true,
        introducers: [
          wrtc
        ],
      };

      network = await setupNetwork(archive, opts);
      await waitForMetadata(archive);
      return testReplicated(archive);
    });
  });

  context('WebrtcTransport Replication', () => {

    const signalServers = [
      'https://signal.dat-web.eu',
    ];

    it('replicates to itself', async function () {
      this.timeout(5000);
      const t1 = new WebRTCTransport(signalServers, { trickle: false });
      const t2 = new WebRTCTransport(signalServers, { trickle: false });
      return selfReplicationTest({
        transport: {
          webrtc: t1,
        },
      }, {
        sparse: true,
        transport: {
          webrtc: t2,
        }
      }, (n1, n2) => {
        n2.emit('peer', {
          id: t1.peerId,
          type: 'webrtc',
          channel: archive.discoveryKey,
          host: t1.address,
        });
      });
    });

    it('replicates to a node server', async function () {
      this.timeout(5000);

      archive = await createHyperDrive(key);
      const webrtc = new WebRTCTransport(signalServers, { trickle: false });
      const opts = {
        debug: true,
        sparse: true,
        transport: {
          webrtc,
        },
      };

      network = await setupNetwork(archive, opts);
      setTimeout(() => {
        network.emit('peer', {
          id: Buffer.from('dat-node-test').toString('hex'),
          type: 'webrtc',
          channel: archive.discoveryKey,
        });
      }, 10);
      await waitForMetadata(archive);
      return testReplicated(archive);
    });

    it('replicates to other signal servers', async function () {
      this.timeout(5000);
      const t1 = new WebRTCTransport(signalServers, { trickle: false });
      const t2 = new WebRTCTransport(['https://signalhub-jccqtwhdwc.now.sh'], { trickle: false });
      return selfReplicationTest({
        transport: {
          webrtc: t1,
        },
      }, {
        sparse: true,
        transport: {
          webrtc: t2,
        }
      }, (n1, n2) => {
        n2.emit('peer', {
          id: t1.peerId,
          type: 'webrtc',
          channel: archive.discoveryKey,
          host: t1.address,
        });
      });
    });

  });

  context('Discovery', () => {

    let announcer;
    let introducer;

    beforeEach(async () => {
      archive = await createHyperDrive(key);
    });

    afterEach(() => {
      announcer.leave(archive.discoveryKey);
      introducer.leave(archive.discoveryKey);
    });

    it('emits a peer when searching for a discovery key', function(done) {
      this.timeout(5000);
      announcer = new LanDiscovery({ announce: true });
      const opts = {
        transport: {
          tcp: { port: 3154 }
        }
      };
      announcer.join(archive.discoveryKey, opts);
      introducer = new LanDiscovery({ announce: false });
      introducer.on('peer', (peer) => {
        console.log('peer', peer);
        chai.expect(peer.port).to.equal(3154);
        chai.expect(peer.channel).to.eql(archive.discoveryKey);
        done();
      });
      introducer.join(archive.discoveryKey);
    });
  });

});

// mocha.checkLeaks();
mocha.run();