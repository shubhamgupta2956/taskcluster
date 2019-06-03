const libUrls = require('taskcluster-lib-urls');
const taskcluster = require('taskcluster-client');
const {stickyLoader, Secrets, withEntity, fakeauth, withMonitor, withPulse} = require('taskcluster-lib-testing');
const builder = require('../src/api');
const data = require('../src/data');
const load = require('../src/main');

exports.rootUrl = 'http://localhost:60409';

exports.load = stickyLoader(load);
exports.load.inject('profile', 'test');
exports.load.inject('process', 'test');

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-worker-manager',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId', mock: 'testing'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken', mock: 'testing'},
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl', mock: libUrls.testRootUrl()},
    ],
    azure: [
      {env: 'AZURE_ACCOUNT', cfg: 'azure.accountId', name: 'accountId'},
    ],
  },
  load: exports.load,
});

exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'WorkerPoolError', data.WorkerPoolError);
  withEntity(mock, skipping, exports, 'Worker', data.Worker);
  withEntity(mock, skipping, exports, 'WorkerPool', data.WorkerPool);
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-worker-manager'});
};

exports.withProvisioner = (mock, skipping) => {
  let provisioner;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.initiateProvisioner = async () => {
      provisioner = await exports.load('provisioner');
      // remove it right away, so it will be re-created next time
      exports.load.remove('provisioner');

      await provisioner.initiate();
      return provisioner;
    };
    exports.terminateProvisioner = async () => {
      if (provisioner) {
        await provisioner.terminate();
        provisioner = null;
      }
    };
  });

  teardown(function() {
    if (provisioner) {
      throw new Error('Must call terminateProvisioner if you have started it');
    }
  });
};

/**
 * Set up a fake tc-queue object that supports only the `pendingTasks` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.queue`.
 */
exports.withFakeQueue = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    exports.queue = stubbedQueue();
    exports.load.inject('queue', exports.queue);
  });
};

/**
 * Set up a fake tc-notify object that supports only the `email` method,
 * and inject that into the loader.  This is injected regardless of
 * whether we are mocking.
 *
 * The component is available at `helper.notify`.
 *
 * We consider any emailing to be test-failing at the moment
 */
exports.withFakeNotify = (mock, skipping) => {
  suiteSetup(function() {
    if (skipping()) {
      return;
    }

    exports.notify = stubbedNotify();
    exports.load.inject('notify', exports.notify);
  });
};

exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await exports.load('cfg');

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);

    fakeauth.start({
      'test-client': ['*'],
    }, {rootUrl: exports.rootUrl});

    // Create client for working with API
    exports.WorkerManager = taskcluster.createClient(builder.reference());

    exports.workerManager = new exports.WorkerManager({
      // Ensure that we use global agent, to avoid problems with keepAlive
      // preventing tests from exiting
      agent: require('http').globalAgent,
      rootUrl: exports.rootUrl,
      credentials: {
        clientId: 'test-client',
        accessToken: 'none',
      },
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
  });
};

/**
 * make a queue object with the `pendingTasks` method stubbed out, and with
 * an `setPending` method to add fake tasks.
 */
const stubbedQueue = () => {
  const provisioners = {};
  const queue = new taskcluster.Queue({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      pendingTasks: async (provisionerId, workerType) => {
        let pendingTasks = 0;
        if (provisioners[provisionerId] && provisioners[provisionerId][workerType]) {
          pendingTasks = provisioners[provisionerId][workerType];
        }
        return {
          pendingTasks,
          provisionerId,
          workerType,
        };
      },
    },
  });

  queue.setPending = function(provisionerId, workerType, pending) {
    provisioners[provisionerId] = provisioners[provisionerId] || {};
    provisioners[provisionerId][workerType] = pending;
  };

  return queue;
};

/**
 * make a notify object with the `email` method stubbed out
 */
const stubbedNotify = () => {
  const notify = new taskcluster.Notify({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'worker-manager',
      accessToken: 'none',
    },
    fake: {
      email: async (address, subject, content) => {
        throw new Error(content);
      },
    },
  });

  return notify;
};
