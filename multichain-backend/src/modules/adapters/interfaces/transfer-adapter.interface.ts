import { TransferDto, TxResult, VerifyTxResult } from '../../../common/types/common.types.js';

export interface ITransferAdapter {
  /**
   * Transfer native currency or token
   */
  transfer(dto: TransferDto): Promise<TxResult>;

  /**
   * Verify transaction on-chain status
   */
  verifyTx(txHash: string): Promise<VerifyTxResult>;

  /**
   * Get balance of native currency or token
   */
  getBalance(address: string, tokenAddress?: string): Promise<string>;
}
