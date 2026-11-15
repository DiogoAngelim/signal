import { SignalRuntime, createInProcessDispatcher } from '../vendor/api/runtime/src/index';
import { fitBinaryIsotonicCalibrator, applyBinaryIsotonicCalibrator } from '../vendor/packages/decision/src/binary-calibration';
import { createSignalError } from '@signal/protocol';
import { z } from 'zod';
import { planPortfolio } from './portfolio.mjs';
export { fitBinaryIsotonicCalibrator, applyBinaryIsotonicCalibrator };
export function createInvestingRuntime() {
 const runtime = new SignalRuntime({ eventPort: createInProcessDispatcher(), runtimeName: 'stocks-optimizer-verified-investing', requireMutationAuthorization: true });
 runtime.registerQuery({ name: 'investing.plan.v1', kind: 'query', inputSchema: z.unknown(), resultSchema: z.unknown(), handler: (input: any) => {
  try { return planPortfolio(input); }
  catch (error: any) { throw createSignalError('VALIDATION_ERROR', String(error?.code || 'invalid_investing_input'), { retryable: false }); }
 } });
 return runtime;
}
