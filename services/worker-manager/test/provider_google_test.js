const taskcluster = require('taskcluster-client');
const assert = require('assert');
const helper = require('./helper');
const {GoogleProvider} = require('../src/providers/google');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;
  let workerPool;
  let worker;
  let providerId = 'google';
  let workerPoolId = 'foo/bar';

  setup(async function() {
    provider = new GoogleProvider({
      providerId,
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      estimator: await helper.load('estimator'),
      fake: true,
      rootUrl: helper.rootUrl,
      Worker: helper.Worker,
      WorkerPool: helper.WorkerPool,
    });
    workerPool = await helper.WorkerPool.create({
      workerPoolId,
      providerId,
      description: 'none',
      previousProviderIds: [],
      created: new Date(),
      lastModified: new Date(),
      config: {
        minCapacity: 1,
        maxCapacity: 1,
        capacityPerInstance: 1,
        machineType: 'n1-standard-2',
        regions: ['us-east1'],
        userData: {},
        scheduling: {},
        networkInterfaces: [],
        disks: [],
      },
      owner: 'whatever@example.com',
      providerData: {},
      emailOnError: false,
    });
    worker = await helper.Worker.create({
      workerPoolId: workerPoolId,
      workerGroup: providerId,
      workerId: 'abc123',
      providerId,
      created: new Date(),
      expires: taskcluster.fromNow('1 hour'),
      state: helper.Worker.states.REQUESTED,
      providerData: {},
    });
    await provider.setup();
  });

  test('provisioning loop', async function() {
    await provider.provision({workerPool});
    assert.equal(workerPool.providerData.google.trackedOperations.length, 1);
    assert.equal(workerPool.providerData.google.trackedOperations[0].name, 'foo');
    assert.equal(workerPool.providerData.google.trackedOperations[0].zone, 'whatever/a');
    await provider.handleOperations({workerPool});
    assert.equal(workerPool.providerData.google.trackedOperations.length, 0);
  });

  test('worker-scan loop', async function() {
    // On the first run we've faked that the instance is running
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await workerPool.reload();
    assert.equal(workerPool.providerData.google.running, 1);

    // And now we fake it is stopped
    await provider.scanPrepare();
    await provider.checkWorker({worker});
    await provider.scanCleanup();
    await workerPool.reload();
    assert.equal(workerPool.providerData.google.running, 0);
  });
});
