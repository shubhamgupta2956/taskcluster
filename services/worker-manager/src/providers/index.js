const {NullProvider} = require('./null');
const {TestingProvider} = require('./testing');
const {StaticProvider} = require('./static');
const {GoogleProvider} = require('./google');

const PROVIDER_TYPES = {
  null: NullProvider,
  testing: TestingProvider,
  static: StaticProvider,
  google: GoogleProvider,
};

/**
 * Load all of the providers in the configuration, including loading
 * their providerType implementation as required
 */
class Providers {
  async setup({cfg, monitor, notify, estimator, Worker, WorkerPool, WorkerPoolError, validator, fakeCloudApis}) {
    this._providers = {};

    if (cfg.providers['null-provider']) {
      throw new Error('Explicit configuration of the null-provider providerId is not allowed');
    }

    const nullEntry = ['null-provider', {providerType: 'null'}];
    for (const [providerId, meta] of Object.entries(cfg.providers).concat([nullEntry])) {
      if (meta.providerType === 'null' && providerId !== 'null-provider') {
        throw new Error('Only the `null-provider` providerId may have providerType `null`');
      }
      const Provider = PROVIDER_TYPES[meta.providerType];
      if (!Provider) {
        throw new Error(`Unkown providerType ${meta.providerType} selected for providerId ${providerId}.`);
      }
      const provider = new Provider({
        providerId,
        notify,
        monitor: monitor.childMonitor(`provider.${providerId}`),
        rootUrl: cfg.taskcluster.rootUrl,
        taskclusterCredentials: cfg.taskcluster.credentials,
        estimator,
        Worker,
        WorkerPool,
        WorkerPoolError,
        validator,
        fakeCloudApis,
        ...meta,
      });
      this._providers[providerId] = provider;
      await provider.setup();
    }

    // return self to make this easier to use in a loader component
    return this;
  }

  /**
   * Get a list of valid providerIds
   */
  validProviderIds() {
    return Object.keys(this._providers);
  }

  /**
   * Run the async callback for all providers
   */
  forAll(cb) {
    return Promise.all(Object.values(this._providers).map(cb));
  }

  /**
   * Return true if this providerId is defined
   */
  has(providerId) {
    return !!this._providers[providerId];
  }

  /**
   * Get the named provider instance.
   */
  get(providerId) {
    return this._providers[providerId];
  }
}

module.exports = {Providers};
