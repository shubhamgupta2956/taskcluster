const slugid = require('slugid');
const _ = require('lodash');
const fs = require('fs');
const taskcluster = require('taskcluster-client');
const libUrls = require('taskcluster-lib-urls');
const uuid = require('uuid');
const {google} = require('googleapis');
const {FakeGoogle} = require('./fake-google');
const {Provider} = require('./provider');

class GoogleProvider extends Provider {

  constructor({
    providerId,
    taskclusterCredentials,
    monitor,
    estimator,
    notify,
    rootUrl,
    project,
    instancePermissions,
    creds,
    credsFile,
    validator,
    Worker,
    WorkerPool,
    WorkerPoolError,
    fake = false,
  }) {
    super({
      providerId,
      taskclusterCredentials,
      monitor,
      notify,
      rootUrl,
      estimator,
      validator,
      Worker,
      WorkerPool,
      WorkerPoolError,
    });
    this.configSchema = 'config-google';
    this.fake = fake;

    this.instancePermissions = instancePermissions;
    this.project = project;
    this.zonesByRegion = {};

    // TODO: Make fakes be injected
    if (fake) {
      this.ownClientEmail = 'whatever@example.com';
      const fakeGoogle = new FakeGoogle();
      this.compute = fakeGoogle.compute();
      this.iam = fakeGoogle.iam();
      this.crm = fakeGoogle.cloudresourcemanager();
      this.oauth2 = new fakeGoogle.OAuth2({project});
      return;
    }

    if (!creds && credsFile) {
      creds = JSON.parse(fs.readFileSync(credsFile));
    }
    try {
      creds = JSON.parse(creds);
    } catch (err) {
      if (err.name !== 'SyntaxError') {
        throw err;
      }
      creds = JSON.parse(Buffer.from(creds, 'base64'));
    }
    this.ownClientEmail = creds.client_email;
    const client = google.auth.fromJSON(creds);
    client.scopes = [
      'https://www.googleapis.com/auth/compute', // For configuring instance templates, groups, etc
      'https://www.googleapis.com/auth/iam', // For setting up service accounts for each WorkerPool
      'https://www.googleapis.com/auth/cloud-platform', // To set roles for service accounts
    ];
    this.compute = google.compute({
      version: 'v1',
      auth: client,
    });
    this.iam = google.iam({
      version: 'v1',
      auth: client,
    });
    this.crm = google.cloudresourcemanager({
      version: 'v1',
      auth: client,
    });

    this.oauth2 = new google.auth.OAuth2();
  }

  /*
   * We will first set up a service account and role for each worker to use
   * since the default service account workers get is not very restricted
   */
  async setup() {
    const accountId = 'taskcluster-workers';
    this.workerAccountEmail = `${accountId}@${this.project}.iam.gserviceaccount.com`;
    const accountRef = `projects/${this.project}/serviceAccounts/${this.workerAccountEmail}`;
    const roleId = 'taskcluster_workers';
    const roleName =`projects/${this.project}/roles/${roleId}`;

    // First we set up the service account
    const serviceAccount = await this.readModifySet({
      read: async () => (await this.iam.projects.serviceAccounts.get({
        name: accountRef,
      })).data,
      compare: () => true, // We do not modify this resource
      modify: () => {}, // Not needed due to no modifications
      set: async () => await this.iam.projects.serviceAccounts.create({
        name: `projects/${this.project}`,
        accountId,
        requestBody: {
          serviceAccount: {
            displayName: 'Taskcluster Workers',
            description: 'A service account shared by all Taskcluster workers.',
          },
        },
      }),
    });
    this.workerAccountId = serviceAccount.uniqueId;

    // Next we ensure that worker-manager can create instances with
    // this service account
    // If this is not the first time this has been set up, it will
    // simply overwrite the values in there now. This will undo manual changes.
    await this.iam.projects.serviceAccounts.setIamPolicy({
      resource: `projects/${this.project}/serviceAccounts/${this.workerAccountEmail}`,
      requestBody: {
        policy: {
          bindings: [{
            role: 'roles/iam.serviceAccountUser',
            members: [`serviceAccount:${this.ownClientEmail}`],
          }],
        },
      },
    });

    // Now we create a role or update it with whatever permissions we've configured
    // for this provider
    await this.readModifySet({
      read: async () => (await this.iam.projects.roles.get({
        name: roleName,
      })).data,
      compare: role => _.isEqual(role.includedPermissions, this.instancePermissions),
      modify: async role => {
        role.includedPermissions = this.instancePermissions;
        await this.iam.projects.roles.patch({
          name: roleName,
          updateMask: 'includedPermissions',
          requestBody: role,
        });
      },
      set: async () => this.iam.projects.roles.create({
        parent: `projects/${this.project}`,
        requestBody: {
          roleId,
          role: {
            title: 'Taskcluster Workers',
            description: 'Role shared by all Taskcluster workers.',
            includedPermissions: this.instancePermissions,
          },
        },
      }),
    });

    // Assign the role to the serviceAccount and we're good to go!
    // Projects always have these policies so no need for set()
    const binding = {
      role: `projects/${this.project}/roles/${roleId}`,
      members: [`serviceAccount:${this.workerAccountEmail}`],
    };
    await this.readModifySet({
      read: async () => (await this.crm.projects.getIamPolicy({
        resource: this.project,
        requestBody: {},
      })).data,
      compare: policy => policy.bindings.some(b => _.isEqual(b, binding)),
      modify: async policy => {
        policy.bindings.push(binding);
        await this.crm.projects.setIamPolicy({
          resource: this.project,
          requestBody: {
            policy,
          },
        });
      },
    });
  }

  /**
   * Given a WorkerPool and instance identity token from google, we return
   * taskcluster credentials for a worker to use if it is valid.
   *
   * All fields we check in the token are signed by google rather than the
   * requester so we know that they are not forged arbitrarily. Be careful
   * when selecting new fields to validate here, they may come from the requester.
   */
  async verifyIdToken({token, workerPool}) {
    const {workerPoolId} = workerPool;

    // This will throw an error if the token is invalid at all
    let {payload} = await this.oauth2.verifyIdToken({
      idToken: token,
      audience: this.rootUrl,
    });
    const dat = payload.google.compute_engine;

    // First check to see if the request is coming from the project this provider manages
    if (dat.project_id !== this.project) {
      const error = new Error(`Invalid project ${dat.project_id} is not ${this.project}`);
      error.project = dat.project_id;
      error.validProject = this.project;
      throw error;
    }

    // Now check to make sure that the serviceAccount that the worker has is the
    // serviceAccount that we have configured that worker to use. Nobody else in the project
    // should have permissions to create instances with this serviceAccount.
    if (payload.sub !== this.workerAccountId) {
      const error = new Error('Attempt to claim workertype creds from non-workertype instance');
      error.correctId = this.workerAccountId;
      error.requestingAccountId = payload.sub;
      throw error;
    }

    // Google docs say instance id is globally unique even across projects
    const workerId = dat.instance_id;
    const workerGroup = this.providerId;

    const worker = await this.Worker.load({
      workerPoolId,
      workerGroup,
      workerId,
    }, true);

    // There will be no worker if either the workerId is not one we've made or if it is actually
    // from a different workerPool since the load will not find it in that case
    if (!worker) {
      const error = new Error('Attempt to claim credentials from a non-existent worker');
      error.requestingId = workerId;
      throw error;
    }

    if (worker.state !== this.Worker.states.REQUESTED) {
      throw new Error('Attempt to reclaim credentials from an already existing worker');
    }

    await worker.modify(w => {
      w.state = this.Worker.states.RUNNING;
    });

    return taskcluster.createTemporaryCredentials({
      clientId: `worker/google/${this.project}/${workerGroup}/${workerId}`,
      scopes: [
        `assume:worker-type:${workerPoolId}`,
        `assume:worker-id:${workerGroup}/${workerId}`,
        `queue:worker-id:${workerGroup}/${workerId}`,
        `secrets:get:worker-type:${workerPoolId}`,
        `queue:claim-work:${workerPoolId}`,
      ],
      start: taskcluster.fromNow('-15 minutes'),
      expiry: taskcluster.fromNow('96 hours'),
      credentials: this.taskclusterCredentials,
    });
  }

  async deprovision({workerPool}) {
    await workerPool.modify(wt => {
      wt.previousProviders = wt.previousProviders.filter(p => p !== this.providerId);
      delete wt.providerData[this.providerId];
    });
  }

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;

    // TODO: I worry that providerData.trackedOperations will be larger than a single record
    // probably need to have providerData as separate table?
    const providerData = workerPool.providerData[this.providerId];
    if (!providerData || providerData.running === undefined || !providerData.trackedOperations) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId] = wt.providerData[this.providerId] || {};
        wt.providerData[this.providerId].running = wt.providerData[this.providerId].running || 0;
        wt.providerData[this.providerId].trackedOperations = wt.providerData[this.providerId].trackOperations || [];
      });
    }
    const regions = workerPool.config.regions;

    // TODO: Use p-queue for all operations against google

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      running: workerPool.providerData[this.providerId].running,
    });

    const operations = [];

    for (let i = 0; i < toSpawn; i++) {
      const region = regions[Math.floor(Math.random() * regions.length)];
      if (!this.zonesByRegion[region]) {
        this.zonesByRegion[region] = (await this.compute.regions.get({
          project: this.project,
          region,
        })).data.zones;
      }
      const zones = this.zonesByRegion[region];
      const zone = zones[Math.floor(Math.random() * zones.length)].split('/').slice(-1)[0];

      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // The lost entropy from downcasing, etc should be ok due to the fact that
      // only running instances need not be identical. We do not use this name to identify
      // workers in taskcluster.
      const instanceName = `${workerPoolId}-${slugid.nice().replace(/_/g, '-').toLowerCase()}`;

      let op;

      try {
        const res = await this.compute.instances.insert({
          project: this.project,
          zone,
          requestId: uuid.v4(), // This is just for idempotency
          requestBody: {
            name: instanceName,
            labels: {
              workerPoolId,
            },
            description: workerPool.description,
            machineType: `zones/${zone}/machineTypes/${workerPool.config.machineType}`,
            scheduling: workerPool.config.scheduling,
            networkInterfaces: workerPool.config.networkInterfaces,
            disks: workerPool.config.disks,
            serviceAccounts: [{
              email: this.workerAccountEmail,
              scopes: [
                /*
                 * This looks scary but is ok. According to
                 * https://cloud.google.com/compute/docs/access/service-accounts#accesscopesiam
                 *
                 * "A best practice is to set the full cloud-platform
                 * access scope on the instance, then securely limit
                 * the service account's API access with IAM roles."
                 *
                 * Which is what we do.
                 */
                'https://www.googleapis.com/auth/cloud-platform',
              ],
            }],
            metadata: {
              items: [
                {
                  key: 'taskcluster',
                  value: JSON.stringify({
                    workerPoolId,
                    workerGroup: this.providerId,
                    credentialUrl: libUrls.api(this.rootUrl, 'worker-manager', 'v1', `credentials/google/${workerPoolId}`),
                    rootUrl: this.rootUrl,
                    userData: workerPool.config.userData,
                  }),
                },
              ],
            },
          },
        });
        op = res.data;
      } catch (err) {
        if (!err.errors) {
          throw err;
        }
        for (const error of err.errors) {
          await workerPool.reportError({
            kind: 'creation-error',
            title: 'Instance Creation Error',
            description: error.message, // TODO: Make sure we clear exposing this with security folks
            notify: this.notify,
            WorkerPoolError: this.WorkerPoolError,
          });
        }
        return;
      }

      await this.Worker.create({
        workerPoolId,
        providerId: this.providerId,
        workerGroup: this.providerId,
        workerId: op.targetId,
        created: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: this.Worker.states.REQUESTED,
        providerData: {
          project: this.project,
          zone,
        },
      });
      operations.push({
        name: op.name,
        zone: op.zone,
      });
    }

    if (operations.length) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId].trackedOperations =
          wt.providerData[this.providerId].trackedOperations.concat(operations);
      });
    }

    await this.handleOperations({workerPool});
  }

  /**
   * It is important that with the current design we only check on errors
   * for error reporting. We should not use it to gate further progress of
   * provisioning due to the fact that we might not succeed in recording
   * the operation when it actually suceeded.
   */
  async handleOperations({workerPool}) {
    if (!workerPool.providerData[this.providerId].trackedOperations.length) {
      return;
    }
    const ongoing = [];
    for (const op of workerPool.providerData[this.providerId].trackedOperations) {
      if (await this.handleOperation({op, workerPool})) {
        ongoing.push(op);
      }
    }

    await workerPool.modify(wt => {
      wt.providerData[this.providerId].trackedOperations = ongoing;
    });
  }

  async handleOperation({op, workerPool}) {
    let operation;
    let args;
    let obj;
    if (op.region) {
      args = {
        project: this.project,
        region: op.region.split('/').slice(-1)[0],
        operation: op.name,
      };
      obj = this.compute.regionOperations;
    } else if (op.zone) {
      args = {
        project: this.project,
        zone: op.zone.split('/').slice(-1)[0],
        operation: op.name,
      };
      obj = this.compute.zoneOperations;
    } else {
      args = {
        project: this.project,
        operation: op.name,
      };
      obj = this.compute.globalOperations;
    }

    try {
      operation = (await obj.get(args)).data;
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      // If the operation is no longer existing, nothing for us to do
      return false;
    }

    // Let's check back in on the next provisioning iteration if unfinished
    if (operation.status !== 'DONE') {
      return true;
    }

    if (operation.error) {
      for (const err of operation.error.errors) { // Each operation can have multiple errors
        await workerPool.reportError({
          kind: 'operation-error',
          title: 'Operation Error',
          description: err.message, // TODO: Make sure we clear exposing this with security folks
          extra: {
            code: err.code,
          },
          notify: this.notify,
          WorkerPoolError: this.WorkerPoolError,
        });
      }
    }
    await obj.delete(args);
    return false;
  }

  /*
   * Called before an iteration of the worker scanner
   */
  async scanPrepare() {
    this.seen = {};
  }

  /*
   * Called for every worker on a schedule so that we can update the state of
   * the worker locally
   */
  async checkWorker({worker}) {
    const states = this.Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    let res;
    try {
      res = await this.compute.instances.get({
        project: worker.providerData.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      });
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      await worker.modify(w => {
        w.state = states.STOPPED;
      });
      return;
    }
    const {status} = res.data;
    if (['PROVISIONING', 'STAGING', 'RUNNING'].includes(status)) {
      this.seen[worker.workerPoolId] += 1;
    } else if (['TERMINATED', 'STOPPED'].includes(status)) {
      await this.compute.instances.delete({
        project: worker.providerData.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      });
      await worker.modify(w => {
        w.state = states.STOPPED;
      });
    }
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await this.WorkerPool.load({
        workerPoolId,
      }, true);

      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      await workerPool.modify(wt => {
        if (!wt.providerData[this.providerId]) {
          wt.providerData[this.providerId] = {};
        }
        wt.providerData[this.providerId].running = seen;
      });
    }));
  }

  /*
   * A useful wrapper for interacting with resources
   * that google wants you to use read-modify-set semantics with
   * Example: https://cloud.google.com/iam/docs/creating-custom-roles#read-modify-write
   */
  async readModifySet({
    compare,
    read,
    modify,
    set,
    tries = 0,
  }) {
    let resource;
    try {
      // First try to get the resource
      resource = await read();
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
    }

    try {
      if (resource) {
        // If the value in google is different
        // from the one we want it to be, we try to update it
        if (!compare(resource)) {
          resource = await modify(resource);
        }
        return resource;
      } else {
        // If the resource was never there in the first place, create it
        return await set();
      }
    } catch (err) {
      if (err.code !== 409 && tries < 5) {
        throw err;
      }
      await new Promise(accept => setTimeout(accept, Math.pow(2, tries) * 100));
      return await this.readModifySet({
        compare,
        read,
        modify,
        set,
        tries: tries++,
      });
    }
  }
}

module.exports = {
  GoogleProvider,
};
