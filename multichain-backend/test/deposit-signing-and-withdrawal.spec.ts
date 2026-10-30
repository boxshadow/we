import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepositService } from '../src/modules/transfer/deposit.service.js';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { BalanceService } from '../src/modules/balance/balance.service.js';
import { TokenConfigService } from '../src/modules/token/token-config.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { DepositWalletService } from '../src/modules/wallet/deposit-wallet.service.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('Deposit Direct Signing & Server-Side Withdrawal Workflows', () => {
  let depositService: DepositService;
  let withdrawService: WithdrawService;
  let balanceService: BalanceService;
  let tokenConfigService: TokenConfigService;
  let networkRegistryService: NetworkRegistryService;
  let depositWalletService: DepositWalletService;
  let mockWalletSignerManager: any;
  let mockTransferService: any;

  const testUserId = 'test-user-wallet-sign-999';

  beforeEach(async () => {
    networkRegistryService = new NetworkRegistryService();
    tokenConfigService = new TokenConfigService(networkRegistryService);
    depositWalletService = new DepositWalletService(networkRegistryService);
    balanceService = new BalanceService();

    mockWalletSignerManager = {
      getRandomDepositWallet: vi.fn().mockResolvedValue({
        address: '0xDepositFallbackWallet11111111111111111111',
      }),
      getRandomWithdrawWallet: vi.fn().mockResolvedValue({
        address: '0xWithdrawVaultWallet99999999999999999999',
      }),
      getRandomWallet: vi.fn().mockResolvedValue({
        address: '0xGeneralVaultWallet88888888888888888888',
      }),
    };

    mockTransferService = {
      verifyTx: vi.fn().mockResolvedValue({
        confirmed: true,
        blockNumber: 19842100,
        from: '0xUserPayer11111111111111111111111111111111',
        to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '20.0',
        tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      }),
      transfer: vi.fn().mockResolvedValue({
        success: true,
        txHash: '0xServerBroadcastedWithdrawHash1234567890',
        blockNumber: 19842105,
      }),
    };

    depositService = new DepositService(
      mockWalletSignerManager,
      mockTransferService,
      networkRegistryService,
      depositWalletService,
      tokenConfigService,
      balanceService,
    );

    withdrawService = new WithdrawService(
      mockWalletSignerManager,
      mockTransferService,
      networkRegistryService,
      tokenConfigService,
      balanceService,
    );

    // Seed test deposit wallet & tokens
    await depositWalletService.addWallet({
      networkId: 'ethereum',
      chain: 'EVM',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      label: '以太坊充值专属收款钱包 A',
    });

    await tokenConfigService.addToken({
      networkId: 'ethereum',
      symbol: 'USDT',
      name: 'Tether USD',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      minDeposit: '1.0',
    });
  });

  describe('1. 充值端：直接拉起钱包加签与原始交易构建 (Direct Wallet Signing)', () => {
    it('创建充值意图时，服务端应计算出准确的 rawTx 数据供前端直接调用钱包签名', async () => {
      const intent = await depositService.createDepositIntent({
        userId: testUserId,
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '50.0',
      });

      expect(intent.orderId).toBeDefined();
      expect(intent.depositAddress).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(intent.rawTx).toBeDefined();

      const rawTx = intent.rawTx!;
      expect(rawTx.family).toBe('EVM');
      expect(rawTx.to.toLowerCase()).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase());
      expect(rawTx.value).toBe('0x0');
      // ERC20 transfer selector 0xa9059cbb
      expect(rawTx.data.startsWith('0xa9059cbb')).toBe(true);
      expect(rawTx.method).toBe('transfer');
      expect(rawTx.decimals).toBe(6);
      expect(rawTx.depositAddress).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    });

    it('原生币充值时，rawTx 的 to 应为充值钱包，value 为相应十六进制 Wei', async () => {
      const intent = await depositService.createDepositIntent({
        userId: testUserId,
        network: 'ethereum',
        amount: '1.5',
      });

      expect(intent.rawTx).toBeDefined();
      const rawTx = intent.rawTx!;
      expect(rawTx.to).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(rawTx.data).toBe('0x');
      expect(rawTx.method).toBe('native');
      expect(rawTx.value.startsWith('0x')).toBe(true);
    });

    it('支持查询充值订单的区块链确认进度与区块深度匹配', async () => {
      const intent = await depositService.createDepositIntent({
        userId: testUserId,
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '20.0',
      });

      // 阶段 1: 刚创建未提交 Hash
      const progress1 = await depositService.getDepositProgress(intent.orderId);
      expect(progress1.status).toBe(OrderStatus.PENDING);
      expect(progress1.progress).toBe(0);

      // 阶段 2: 钱包广播后拿到 txHash 提交验证
      const confirmResult = await depositService.verifyAndConfirmDeposit({
        orderId: intent.orderId,
        txHash: '0xValidTxHashBroadcastedByWallet888',
      });
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.credited).toBe(true);

      // 阶段 3: 查询进度已达到 100%
      const progress2 = await depositService.getDepositProgress(intent.orderId);
      expect(progress2.status).toBe(OrderStatus.CONFIRMED);
      expect(progress2.progress).toBe(100);
      expect(progress2.credited).toBe(true);
      expect(progress2.txHash).toBe('0xValidTxHashBroadcastedByWallet888');

      // 验证用户代币余额成功增加
      const bal = await balanceService.getSingleBalance(testUserId, 'ethereum', 'USDT');
      expect(bal).toBe('20');
    });
  });

  describe('2. 提现端：服务端发起线上真实交易与风控回滚 (Server-Side Withdrawal)', () => {
    beforeEach(async () => {
      // Pre-seed user balance with 100 USDT
      await balanceService.creditBalance(testUserId, 'ethereum', 'USDT', '0xdAC17F958D2ee523a2206206994597C13D831ec7', '100.0');
    });

    it('用户余额充足时，提现成功扣除余额并由服务端广播链上转账出资', async () => {
      const withdrawResult = await withdrawService.createWithdrawal(testUserId, {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '30.0',
        toAddress: '0xUserTargetDestination1111111111111111111111',
      });

      expect(withdrawResult.success).toBe(true);
      expect(withdrawResult.txHash).toBe('0xServerBroadcastedWithdrawHash1234567890');
      expect(withdrawResult.status).toBe(OrderStatus.CONFIRMED);
      expect(withdrawResult.amount).toBe('30.0');

      // 验证 transferService.transfer 被调用并传入了 WITHDRAW 钱包
      expect(mockTransferService.transfer).toHaveBeenCalledWith(
        'ethereum',
        expect.objectContaining({
          to: '0xUserTargetDestination1111111111111111111111',
          amount: '30.0',
          signerWallet: expect.objectContaining({
            address: '0xWithdrawVaultWallet99999999999999999999',
          }),
        }),
      );

      // 验证用户剩余余额已扣减为 70.0
      const remaining = await balanceService.getSingleBalance(testUserId, 'ethereum', 'USDT');
      expect(remaining).toBe('70');
    });

    it('用户余额不足时，提现应被立即拒绝且不触发链上转账', async () => {
      await expect(
        withdrawService.createWithdrawal(testUserId, {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '200.0', // 用户只有 100
          toAddress: '0xUserTargetDestination1111111111111111111111',
        }),
      ).rejects.toThrow(/资产余额不足/);

      expect(mockTransferService.transfer).not.toHaveBeenCalled();

      // 余额未被动过
      const bal = await balanceService.getSingleBalance(testUserId, 'ethereum', 'USDT');
      expect(bal).toBe('100');
    });

    it('当服务端链上广播转账异常时，自动触发补偿机制，将资金全额退还原路', async () => {
      mockTransferService.transfer.mockRejectedValueOnce(new Error('RPC gas fee insufficient on-chain'));

      await expect(
        withdrawService.createWithdrawal(testUserId, {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '40.0',
          toAddress: '0xUserTargetDestination1111111111111111111111',
        }),
      ).rejects.toThrow(/资金已全额原路退还/);

      // 验证资金已补偿退回，总额依然为 100.0
      const bal = await balanceService.getSingleBalance(testUserId, 'ethereum', 'USDT');
      expect(bal).toBe('100');
    });
  });
});
