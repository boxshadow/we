import { AddLiquidityDto, RemoveLiquidityDto, SwapDto, TxResult } from '../../../common/types/common.types.js';

export interface IDexAdapter {
  /**
   * Add liquidity to DEX pool (Uniswap / Raydium / SunSwap)
   */
  addLiquidity(dto: AddLiquidityDto): Promise<TxResult>;

  /**
   * Remove liquidity from DEX pool
   */
  removeLiquidity(dto: RemoveLiquidityDto): Promise<TxResult>;

  /**
   * Execute market swap (buy/sell)
   */
  swap(dto: SwapDto): Promise<TxResult>;
}
