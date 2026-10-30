import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LockService } from '../src/modules/lock/lock.service.js';
import { EvmAdapter } from '../src/modules/adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../src/modules/adapters/solana/solana.adapter.js';
import { TronAdapter } from '../src/modules/adapters/tron/tron.adapter.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { LockDto, UnlockDto } from '../src/common/types/common.types.js';

describe('Lock & Unlock Workflows (锁仓/池 与 解锁仓/池)', () => {
  let lockService: LockService;
  let networkRegistry: NetworkRegistryService;
  let evmAdapter: EvmAdapter;
  let solanaAdapter: SolanaAdapter;
  let tronAdapter: TronAdapter;

  beforeEach(() => {
    networkRegistry = new NetworkRegistryService();

    evmAdapter = {
      lockToken: vi.fn().mockImplementation(async (dto: LockDto) => ({
        success: true,
        txHash: `0xevm_lock_tx_${dto.networkId || 'eth'}`,
      })),
      unlockToken: vi.fn().mockImplementation(async (dto: UnlockDto) => ({
        success: true,
        txHash: `0xevm_unlock_tx_${dto.networkId || 'eth'}`,
      })),
    } as any;

    solanaAdapter = {
      lockToken: vi.fn().mockResolvedValue({
        success: true,
        txHash: 'solana_lock_tx_signature',
      }),
      unlockToken: vi.fn().mockResolvedValue({
        success: true,
        txHash: 'solana_unlock_tx_signature',
      }),
    } as any;

    tronAdapter = {
      lockToken: vi.fn().mockResolvedValue({
        success: true,
        txHash: 'tron_lock_txid',
      }),
      unlockToken: vi.fn().mockResolvedValue({
        success: true,
        txHash: 'tron_unlock_txid',
      }),
    } as any;

    lockService = new LockService(
      evmAdapter,
      solanaAdapter,
      tronAdapter,
      networkRegistry,
    );
  });

  describe('1. EVM 多网络锁仓与解锁 (Ethereum, BSC, Base)', () => {
    it('应成功在 Ethereum 上进行代币/LP锁仓', async () => {
      const lockDto: LockDto = {
        tokenAddress: '0xUniswapPairLPTokenAddress',
        amount: '1000.0',
        unlockTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30天
        beneficiary: '0xBeneficiaryOwnerAddress',
      };

      const result = await lockService.lockToken('ethereum', lockDto);
      expect(result.success).toBe(true);
      expect(result.txHash).toContain('0xevm_lock_tx_ethereum');
      expect(evmAdapter.lockToken).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: '0xUniswapPairLPTokenAddress',
          networkId: 'ethereum',
        }),
      );
    });

    it('应成功在 BSC 上进行流动性池解锁 (Unlock LP)', async () => {
      const unlockDto: UnlockDto = {
        tokenAddress: '0xPancakePairLPAddress',
        lockId: '1042', // Locker 合约内的 lock ID
        amount: '500.0',
        recipient: '0xProjectOwnerAddress',
      };

      const result = await lockService.unlockToken('bsc', unlockDto);
      expect(result.success).toBe(true);
      expect(result.txHash).toContain('0xevm_unlock_tx_bsc');
      expect(evmAdapter.unlockToken).toHaveBeenCalledWith(
        expect.objectContaining({
          lockId: '1042',
          networkId: 'bsc',
          recipient: '0xProjectOwnerAddress',
        }),
      );
    });
  });

  describe('2. Solana 锁仓与解锁 (Raydium LP)', () => {
    it('支持 Solana 链上 LP 或代币锁仓与解锁', async () => {
      const lockRes = await lockService.lockToken('solana', {
        tokenAddress: 'RaydiumLPAccountPubkey',
        amount: '250.0',
        unlockTimestamp: 1800000000,
        beneficiary: 'SolanaOwnerPubkey',
      });
      expect(lockRes.success).toBe(true);
      expect(solanaAdapter.lockToken).toHaveBeenCalled();

      const unlockRes = await lockService.unlockToken('solana', {
        tokenAddress: 'RaydiumLPAccountPubkey',
        lockId: 'solana-vault-record-1',
        amount: '250.0',
        recipient: 'SolanaOwnerPubkey',
      });
      expect(unlockRes.success).toBe(true);
      expect(solanaAdapter.unlockToken).toHaveBeenCalled();
    });
  });

  describe('3. Tron 锁仓与解锁 (SunSwap LP)', () => {
    it('支持 Tron 链上 TRC20/SunSwap LP 锁仓与解锁', async () => {
      const lockRes = await lockService.lockToken('tron', {
        tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        amount: '5000.0',
        unlockTimestamp: 1800000000,
        beneficiary: 'TBeneficiaryAddress',
      });
      expect(lockRes.success).toBe(true);
      expect(tronAdapter.lockToken).toHaveBeenCalled();

      const unlockRes = await lockService.unlockToken('tron', {
        tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        lockId: 'tron-lock-1',
        amount: '5000.0',
        recipient: 'TBeneficiaryAddress',
      });
      expect(unlockRes.success).toBe(true);
      expect(tronAdapter.unlockToken).toHaveBeenCalled();
    });
  });

  describe('4. 安全熔断机制 (Paused Network Guard)', () => {
    it('当网络处于暂停维护状态时，锁仓与解锁操作均应被严格拒绝', async () => {
      networkRegistry.pauseNetwork('base', true);

      await expect(
        lockService.lockToken('base', {
          tokenAddress: '0xBaseToken',
          amount: '10.0',
          unlockTimestamp: 1800000000,
          beneficiary: '0xUser',
        }),
      ).rejects.toThrow('currently paused');

      await expect(
        lockService.unlockToken('base', {
          tokenAddress: '0xBaseToken',
          lockId: '1',
          amount: '10.0',
          recipient: '0xUser',
        }),
      ).rejects.toThrow('currently paused');
    });
  });
});
