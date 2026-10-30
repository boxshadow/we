import { TokenDeployDto, TxResult } from '../../../common/types/common.types.js';

export interface ITokenAdapter {
  /**
   * Deploy/mint new token (ERC20 / SPL / TRC20)
   */
  deployToken(dto: TokenDeployDto): Promise<{ txResult: TxResult; tokenAddress: string }>;
}
