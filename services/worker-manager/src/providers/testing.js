const {Provider} = require('./provider');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
  }

  async createResources({workerPool}) {
    this.monitor.notice('create-resource', {workerPoolId: workerPool.workerPoolId});
  }

  async updateResources({workerPool}) {
    this.monitor.notice('update-resource', {workerPoolId: workerPool.workerPoolId});
  }

  async removeResources({workerPool}) {
    this.monitor.notice('remove-resource', {workerPoolId: workerPool.workerPoolId});
  }

  async provision({workerPool}) {
    this.monitor.notice('test-provision', {workerPoolId: workerPool.workerPoolId});
  }

  async scanPrepare() {
    this.monitor.notice('scan-prepare', {});
  }

  async checkWorker({worker}) {
    await worker.modify(w => {
      w.providerData.checked = true;
    });
  }

  async scanCleanup() {
    this.monitor.notice('scan-cleanup', {});
  }
}

module.exports = {
  TestingProvider,
};
