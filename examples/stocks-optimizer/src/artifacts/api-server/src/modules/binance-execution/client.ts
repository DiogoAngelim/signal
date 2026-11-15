import { BinanceHttpClient as LegacyReadClient } from './client-legacy';
import type { NormalizedOrderRequest } from './types';
/** Preserve account reads/cancellation while closing the old strategy-to-order bypass. */
export class BinanceHttpClient extends LegacyReadClient {
  async createOrder(_order: NormalizedOrderRequest): Promise<never> {
    throw new Error('LEGACY_ORDER_EXECUTION_DISABLED: use the verified-investing permission and prospective-evidence boundary');
  }
}
