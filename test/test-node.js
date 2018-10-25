const nodeSwarmConfig = require('@sammacbeth/discovery-swarm-node').default;
const WebRTCTransport = require('@sammacbeth/discovery-swarm-web/webrtc-transport').default;
const wrtc = require('wrtc');

const { setupNetwork, createHyperDrive, waitForMetadata } = require('./utils');

const key = 'd116652eca93bc6608f1c09e5fb72b3f654aa3be2a3bca09bccfbe4131ff9e23';

const opts = nodeSwarmConfig({
  debug: true,
  id: Buffer.from('dat-node-test'),
  sparse: false,
  port: 3282
}, {});
const wrtcIntro = new WebRTCTransport([
  'https://signal.dat-web.eu',
], {
  wrtc,
  trickle: false,
});
opts.transport.webrtc = wrtcIntro;

(async () => {
  const archive = await createHyperDrive(key);
  network = await setupNetwork(archive, opts);
  await waitForMetadata(archive);
  console.log('archive ready');
})();