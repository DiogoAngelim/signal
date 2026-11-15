import { createOperationalService as createBaseService } from './lifecycle.mjs';
import { withFeasibleLots } from './rounding-repair.mjs';
import { check } from './contracts.mjs';

/** Production factory: no order can bypass post-rounding feasibility or the existing evidence gates. */
export function createSafeService(ports) {
  const service = createBaseService({ ...ports, runtime: withFeasibleLots(ports.runtime) });
  const execute = service.execute;
  service.execute = async (tenant, key) => {
    const existing = ports.store.execution(tenant, key);
    if (!existing) {
      const plan = ports.store.get(tenant, 'plan', key);
      check(plan?.executionAudit?.passed === true, 'post_rounding_risk_validation_required');
    }
    return execute(tenant, key);
  };
  return service;
}
