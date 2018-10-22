const nodeSwarmConfig = require('@sammacbeth/discovery-swarm-node').default;
const { setupNetwork, createHyperDrive, waitForMetadata } = require('./utils');

const key = 'd116652eca93bc6608f1c09e5fb72b3f654aa3be2a3bca09bccfbe4131ff9e23';

const opts = nodeSwarmConfig({
  debug: true,
  sparse: false,
  port: 3282
}, {});

(async () => {
  const archive = await createHyperDrive(key);
  network = await setupNetwork(archive, opts);
  await waitForMetadata(archive);
  console.log('archive ready');
})();