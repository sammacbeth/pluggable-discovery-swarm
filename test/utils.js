const hyperdrive = require('hyperdrive');
const ram = require('random-access-memory');
const disc = require('@sammacbeth/discovery-swarm').default;
// const disc = require('discovery-swarm');

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

async function setupNetwork(archive, opts) {
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
};

async function createHyperDrive(key) {
  archive = hyperdrive(ram, key);
  await new Promise((resolve) => {
    archive.ready(resolve);
  })
  return archive;
};

async function waitForMetadata(archive) {
  await new Promise((resolve, reject) => {
    archive.metadata.update(err => {
      if (err) reject(err)
      else resolve()
    })
  });
};

module.exports = {
  createNetwork,
  setupNetwork,
  createHyperDrive,
  waitForMetadata,
};