const {splitWorkerPoolId} = require('../utils/workerPool');

module.exports = {
  WorkerManagerWorkerPoolSummary: {
    pendingTasks({ workerPoolId }, args, { loaders }) {
      const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);
      return loaders.pendingTasks.load({
        provisionerId,
        workerType,
      });
    },
  },
  Query: {
    WorkerManagerWorkerPoolSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ filter });
    },
    WorkerManagerWorkers(parent, { workerPool, provider, isQuarantined, filter }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPool, provider, isQuarantined, filter });
    },
  },
};
