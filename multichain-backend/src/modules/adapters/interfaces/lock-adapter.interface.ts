import { LockDto, UnlockDto, TxResult } from '../../../common/types/common.types.js';

export interface ILockAdapter {
  /**
   * Lock tokens or LP tokens until unlockTimestamp
   */
  lockToken(dto: LockDto): Promise<TxResult>;

  /**
   * Unlock tokens or LP tokens from locker contract / vault
   */
  unlockToken(dto: UnlockDto): Promise<TxResult>;
}
