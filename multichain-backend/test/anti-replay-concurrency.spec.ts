import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepositService } from '../src/modules/transfer/deposit.service.js';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { BalanceService } from '../src/modules/balance/balance.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('充值与提现全链路防重放、抗并发双花与余额核验强化测试 (Anti-Replay & Concurrency Security Test)', () => {
  let depositService: DepositService;
  let withdrawService: WithdrawService;
  let balanceService: BalanceService;
  let networkRegistry: NetworkRegistryService;
  let mockSignerManager: any;
  let mockTransferService: any;
  let mockDepositWalletService: any;
  let mockWithdrawWalletService: any;
  let mockTokenConfigService: any;

  beforeEach(() => {
    networkRegistry = new NetworkRegistryService();
    balanceService = new BalanceService(); // 内存模式纯净测试

    mockSignerManager = {
      getRandomDepositWallet: vi.fn().mockImplementation((family: string) => ({
        address: `0xDefault${family}DepositWalletA99999999999999999`,
      })),
      getRandomWithdrawWallet: vi.fn().mockImplementation((family: string) => ({
        id: `withdraw-${family.toLowerCase()}-vault-01`,
        address: `0xWithdraw${family}VaultAddress1111111111111111`,
        providerType: 'KMS_NATIVE_ENCLAVE',
      })),
      getRandomWallet: vi.fn().mockImplementation((family: string) => ({
        address: `0xDefault${family}VaultAddress0000000000000000`,
      })),
    };

    mockDepositWalletService = {
      getRandomActiveDepositWallet: vi.fn().mockImplementation(async () => ({
        address: '0xConfiguredEVMDepositVaultA111111111111111',
        isActive: true,
      })),
      getActiveWallets: vi.fn().mockImplementation(async () => [
        { address: '0xConfiguredEVMDepositVaultA111111111111111' },
      ]),
    };

    mockWithdrawWalletService = {
      getRandomActiveWithdrawWallet: vi.fn().mockImplementation(async (family: string) => ({
        id: `active-${family.toLowerCase()}-hot-vault`,
        address: `0xActive${family}HotVault888888888888888888`,
        providerType: 'RUST_KMS_SGX',
      })),
    };

    mockTokenConfigService = {
      findToken: vi.fn().mockImplementation(async (_netId: string, symbol: string) => {
        if (symbol === 'USDT') {
          return {
            symbol: 'USDT',
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            decimals: 6,
            isActive: true,
            minDeposit: '5.0',
          };
        }
        return null;
      }),
    };

    mockTransferService = {
      // 模拟链上核验，注入 50ms 真实网络 RPC 延迟，以测试并发竞态窗口
      verifyTx: vi.fn().mockImplementation(async (_chain: string, _txHash: string) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          confirmed: true,
          status: 'SUCCESS',
          to: '0xConfiguredEVMDepositVaultA111111111111111',
          amount: '100.0',
          tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          from: '0xUserPayerWalletAddress33333333333333333',
          blockNumber: 19850123,
        };
      }),
      // 模拟链上广播出金
      transfer: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          success: true,
          txHash: `0xWithdrawTx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          blockNumber: 19850200,
        };
      }),
      getBalance: vi.fn().mockResolvedValue('1000.0'),
    };

    depositService = new DepositService(
      mockSignerManager,
      mockTransferService,
      networkRegistry,
      mockDepositWalletService,
      mockTokenConfigService,
      balanceService,
      undefined,
    );

    withdrawService = new WithdrawService(
      mockSignerManager,
      mockTransferService,
      networkRegistry,
      mockTokenConfigService,
      balanceService,
      mockWithdrawWalletService,
      undefined,
    );
  });

  describe('充值防重放攻击与并发竞态防御 (Deposit Anti-Replay)', () => {
    it('应成功拦截毫秒级并发提交相同 txHash 的重放攻击 (In-flight Mutex Protection)', async () => {
      // 1. 创建充值意图
      const intent = await depositService.createDepositIntent({
        userId: 'user-security-test-01',
        network: 'ethereum',
        amount: '100.0',
        tokenSymbol: 'USDT',
      });

      const txHashToReplay = '0xValidLegitOnchainTxHash1234567890abcdef1234567890abcdef';

      // 2. 并发向后端同时发送 3 个包含相同 txHash 的核验确认请求
      const results = await Promise.allSettled([
        depositService.verifyAndConfirmDeposit({ orderId: intent.orderId, txHash: txHashToReplay }),
        depositService.verifyAndConfirmDeposit({ orderId: intent.orderId, txHash: txHashToReplay }),
        depositService.verifyAndConfirmDeposit({ orderId: intent.orderId, txHash: txHashToReplay }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // 必须且只能有 1 个请求成功入账，其余 2 个必须被互斥锁或防重放拦截
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(2);

      rejected.forEach((r) => {
        const reason = (r as PromiseRejectedResult).reason;
        expect(reason).toBeInstanceOf(ConflictException);
        expect(reason.message).toContain('Anti-Replay Violation');
      });

      // 3. 验证用户余额仅被增加了一次 100 USDT，绝无双倍入账！
      const userBalance = await balanceService.getSingleBalance('user-security-test-01', 'ethereum', 'USDT');
      expect(userBalance).toBe('100');
    });

    it('已确认入账的 txHash，后续再次发起独立请求提交必须被持久化防重放坚决拒绝', async () => {
      const intent1 = await depositService.createDepositIntent({
        userId: 'user-security-test-01',
        network: 'ethereum',
        amount: '100.0',
        tokenSymbol: 'USDT',
      });
      const txHash = '0xStaticAlreadyUsedHash11111111111111111111111111111111';

      await depositService.verifyAndConfirmDeposit({ orderId: intent1.orderId, txHash });

      // 另一笔订单试图使用同一个 txHash
      const intent2 = await depositService.createDepositIntent({
        userId: 'user-security-test-02',
        network: 'ethereum',
        amount: '100.0',
        tokenSymbol: 'USDT',
      });

      await expect(
        depositService.verifyAndConfirmDeposit({ orderId: intent2.orderId, txHash }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('提现余额校验、并发双花拦截与业务幂等性 (Withdrawal Anti-Double-Spending)', () => {
    it('账户仅有 100 USDT 时，并发发起 2 笔 100 USDT 提现必须被拦截，杜绝超额双花', async () => {
      const userId = 'user-double-spend-attacker';
      // 预存 100 USDT 可用余额
      await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '100.0');

      const initialBalance = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(initialBalance).toBe('100');

      // 同时并发发起两笔 100 USDT 提现
      const results = await Promise.allSettled([
        withdrawService.createWithdrawal(userId, {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '100.0',
          toAddress: '0xAttackerDestinationAddress111111111111111',
        }),
        withdrawService.createWithdrawal(userId, {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '100.0',
          toAddress: '0xAttackerDestinationAddress111111111111111',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // 必须且仅允许 1 笔提现成功，另 1 笔必须被在途排他锁或余额不足拦截
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err instanceof ConflictException || err instanceof BadRequestException).toBe(true);

      // 验证最终余额为 0，绝对不可能被超额扣成负数！
      const remainingBalance = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(remainingBalance).toBe('0');
    });

    it('携带业务幂等键 (idempotencyKey) 的提现请求，重复调用直接返回幂等结果且不重复扣款', async () => {
      const userId = 'user-idempotency-test';
      await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '500.0');

      const idempotencyKey = 'idem-req-999-uuid-test';

      const firstCall = await withdrawService.createWithdrawal(userId, {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '50.0',
        toAddress: '0xValidUserReceiveAddress222222222222222222',
        idempotencyKey,
      });

      expect(firstCall.success).toBe(true);
      const balanceAfterFirst = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(balanceAfterFirst).toBe('450');

      // 模拟前端因网络超时重新重试相同的 idempotencyKey
      const secondCall = await withdrawService.createWithdrawal(userId, {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '50.0',
        toAddress: '0xValidUserReceiveAddress222222222222222222',
        idempotencyKey,
      });

      expect(secondCall.success).toBe(true);
      expect(secondCall.orderId).toBe(firstCall.orderId);
      expect(secondCall.txHash).toBe(firstCall.txHash);

      // 验证余额仍然是 450，没有被二次扣减！
      const finalBalance = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(finalBalance).toBe('450');
    });
  });
});
