import { PriceResult } from '../../../common/types/common.types.js';

export interface IPriceAdapter {
  /**
   * Fetch current spot price of token
   */
  getPrice(tokenAddress: string, quoteTokenAddress?: string): Promise<PriceResult>;
}
