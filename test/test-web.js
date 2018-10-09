const hyperdrive = require('hyperdrive');
const ram = require('random-access-memory');
const mocha = require('mocha').mocha;
const chai = require('chai');

const disc = require('../');
const DatGatewayIntroducer = require('../web/dat-gateway');
const TCPTransport = require('../webext/tcp-transport');
const WebRTCTransport = require('../web/webrtc-transport');
const LanDiscovery = require('../webext/service-discovery');

mocha.setup('bdd');
const expect = chai.expect;

async function createNetwork(archive, opts, cb) {
  const swarmOpts = Object.assign({
    hash: false,
    stream: opts.stream,
  }, opts);
  const swarm = disc(swarmOpts);
  await swarm.listen(opts.port);
  swarm.join(archive.discoveryKey, {
    announce: !(opts.upload === false),
    key: archive.key,
  }, cb);
  return swarm;
};

function setupNetwork(archive, opts) {
  const netOpts = Object.assign({
    stream: () => {
      const stream = archive.replicate({
        upload: true,
        download: true,
        live: true,
      });
      return stream;
    }
  }, opts);
  return createNetwork(archive, netOpts);
}

async function createHyperDrive(key) {
  archive = hyperdrive(ram, key);
  await new Promise((resolve) => {
    archive.ready(resolve);
  })
  return archive;
}

async function waitForMetadata(archive) {
  await new Promise((resolve, reject) => {
    archive.metadata.update(err => {
      if (err) reject(err)
      else resolve()
    })
  });
}

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
          host: 'macbeth.cc',
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
          port: network._servers.tcp.port,
          type: 'tcp',
          channel: archive.discoveryKey,
          retries: 0,
        });
      });
    });
  });

  context('WebRTC Replication', () => {

    it('replicates to itself', async function () {
      this.timeout(5000);
      const t1 = new WebRTCTransport();
      const t2 = new WebRTCTransport();
      return selfReplicationTest({
        transport: {
          webrtc: t1,
        },
      }, {
        sparse: true,
        transport: {
          webrtc: t2,
        }
      }, (network1, network2) => {
        t2.on('signal', (s) => t1._peer.signal(s))
        network2.emit('peer', {
          id: 'network1',
          offer: network1._servers.webrtc.offer,
          type: 'webrtc',
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