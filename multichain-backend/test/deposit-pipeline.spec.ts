import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepositService } from '../src/modules/transfer/deposit.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('充值全盘链路端到端自动化测试 (Comprehensive Deposit Pipeline)', () => {
  let depositService: DepositService;
  let networkRegistry: NetworkRegistryService;
  let mockSignerManager: any;
  let mockTransferService: any;
  let mockDepositWalletService: any;
  let mockTokenConfigService: any;
  let mockBalanceService: any;

  const mockUserBalances = new Map<string, string>();

  beforeEach(() => {
    mockUserBalances.clear();
    networkRegistry = new NetworkRegistryService();

    mockSignerManager = {
      getRandomDepositWallet: vi.fn().mockImplementation((family: string) => ({
        address: `0xDefault${family}DepositWalletA99999999999999999`,
      })),
    };

    mockDepositWalletService = {
      getRandomActiveDepositWallet: vi.fn().mockImplementation(async (_netId: string) => ({
        id: 'configured-deposit-wallet-01',
        networkId: 'ethereum',
        address: '0xConfiguredEVMDepositVaultA111111111111111',
        isActive: true,
      })),
      getActiveWallets: vi.fn().mockImplementation(async (_netId: string) => [
        { address: '0xConfiguredEVMDepositVaultA111111111111111' },
      ]),
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
        if (symbol === 'DISABLED_TOKEN') {
          return {
            symbol: 'DISABLED_TOKEN',
            contractAddress: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            isActive: false,
            minDeposit: '1.0',
          };
        }
        return null;
      }),
    };

    mockTransferService = {
      verifyTx: vi.fn().mockImplementation(async (_chain: string, txHash: string) => {
        if (txHash.includes('unconfirmed')) {
          return { confirmed: false, status: 'PENDING' };
        }
        if (txHash.includes('wrong_to')) {
          return {
            confirmed: true,
            status: 'SUCCESS',
            to: '0xWrongStrangerWalletAddress9999999999999',
            amount: '50.0',
            tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            blockNumber: 19850000,
          };
        }
        if (txHash.includes('insufficient_amt')) {
          return {
            confirmed: true,
            status: 'SUCCESS',
            to: '0xConfiguredEVMDepositVaultA111111111111111',
            amount: '1.0', // Expected 50.0
            tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            blockNumber: 19850000,
          };
        }
        return {
          confirmed: true,
          status: 'SUCCESS',
          to: '0xConfiguredEVMDepositVaultA111111111111111',
          amount: '50.0',
          tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          from: '0xUserPayerWalletAddress33333333333333333',
          blockNumber: 19850123,
        };
      }),
      getBalance: vi.fn().mockImplementation(async (_chain: string, _address: string, _token?: string) => {
        return '100.0';
      }),
    };

    mockBalanceService = {
      getSingleBalance: vi.fn().mockImplementation(async (userId: string, netId: string, symbol: string) => {
        const key = `${userId}:${netId}:${symbol}`;
        return mockUserBalances.get(key) || '0.0';
      }),
      creditBalance: vi.fn().mockImplementation(async (userId: string, netId: string, symbol: string, _tokenAddress: any, amount: string) => {
        const key = `${userId}:${netId}:${symbol}`;
        const current = parseFloat(mockUserBalances.get(key) || '0.0');
        const next = (current + parseFloat(amount)).toFixed(4);
        mockUserBalances.set(key, next);
        return { balance: next };
      }),
    };

    depositService = new DepositService(
      mockSignerManager,
      mockTransferService,
      networkRegistry,
      mockDepositWalletService,
      mockTokenConfigService,
      mockBalanceService,
      undefined, // prisma
    );
  });

  it('链路阶段 1: 充值意图与金库分配 - 校验网络与代币起充门槛', async () => {
    // 低于最小充值门槛拦截 (minDeposit is 5.0)
    await expect(
      depositService.createDepositIntent({
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '2.0',
        userId: 'user-deposit-01',
      }),
    ).rejects.toThrow('充值金额小于该代币最小起充限额');

    // 停用代币拦截
    await expect(
      depositService.createDepositIntent({
        network: 'ethereum',
        tokenSymbol: 'DISABLED_TOKEN',
        amount: '10.0',
        userId: 'user-deposit-01',
      }),
    ).rejects.toThrow('充值已被管理员停用');
  });

  it('链路阶段 2: 组装未签名交易载荷 - 校验 rawTx 及 6 步阶段初始化', async () => {
    const res = await depositService.createDepositIntent({
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '50.0',
      userId: 'user-deposit-01',
    });

    expect(res.orderId).toBeDefined();
    expect(res.depositAddress).toBe('0xConfiguredEVMDepositVaultA111111111111111');
    expect(res.rawTx).toBeDefined();
    expect(res.rawTx?.method).toBe('transfer');
    expect(res.rawTx?.to).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
    expect(res.rawTx?.data).toContain('0xa9059cbb');

    // 检查 6 阶段流水
    expect(res.pipelineSteps).toBeDefined();
    expect(res.pipelineSteps?.length).toBe(6);
    expect(res.pipelineSteps?.[0].status).toBe('SUCCESS');
    expect(res.pipelineSteps?.[1].status).toBe('SUCCESS');
    expect(res.pipelineSteps?.[2].status).toBe('PENDING');
  });

  it('链路阶段 3 & 4: 提交 txHash 进行链上核验与防重放拦截', async () => {
    const intent = await depositService.createDepositIntent({
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '50.0',
      userId: 'user-deposit-01',
    });

    // 1. 尝试使用未打包确认的 txHash
    const unconfirmedRes = await depositService.verifyAndConfirmDeposit({
      orderId: intent.orderId,
      txHash: '0xTx_unconfirmed_hash_001',
    });
    expect(unconfirmedRes.success).toBe(false);
    expect(unconfirmedRes.status).toBe(OrderStatus.PENDING);

    // 2. 尝试使用汇款目标地址不属于平台的错误交易
    const wrongToRes = await depositService.verifyAndConfirmDeposit({
      orderId: intent.orderId,
      txHash: '0xTx_wrong_to_hash_002',
    });
    expect(wrongToRes.success).toBe(false);
    expect(wrongToRes.status).toBe(OrderStatus.FAILED);
    expect(wrongToRes.error).toContain('收款钱包地址不匹配');

    // 3. 尝试使用到账金额不足的交易
    const insufficientRes = await depositService.verifyAndConfirmDeposit({
      orderId: intent.orderId,
      txHash: '0xTx_insufficient_amt_hash_003',
    });
    expect(insufficientRes.success).toBe(false);
    expect(insufficientRes.status).toBe(OrderStatus.FAILED);
    expect(insufficientRes.error).toContain('实际到账金额不足');

    // 4. 正确交易成功核验并入账
    const successRes = await depositService.verifyAndConfirmDeposit({
      orderId: intent.orderId,
      txHash: '0xTx_valid_deposit_hash_888',
    });
    expect(successRes.success).toBe(true);
    expect(successRes.status).toBe(OrderStatus.CONFIRMED);
    expect(successRes.credited).toBe(true);
    expect(mockUserBalances.get('user-deposit-01:ethereum:USDT')).toBe('50.0000');

    // 5. 防重放攻击测试：重复提交相同 txHash 必须抛出 ConflictException 拒绝
    await expect(
      depositService.verifyAndConfirmDeposit({
        orderId: intent.orderId,
        txHash: '0xTx_valid_deposit_hash_888',
      }),
    ).resolves.toMatchObject({ success: true, credited: true }); // Idempotent same order ok

    // 创建新订单尝试盗用已使用过的 txHash
    const intent2 = await depositService.createDepositIntent({
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '50.0',
      userId: 'user-deposit-02',
    });
    await expect(
      depositService.verifyAndConfirmDeposit({
        orderId: intent2.orderId,
        txHash: '0xTx_valid_deposit_hash_888',
      }),
    ).rejects.toThrow('严禁重复提交');
  });

  it('智能场景 B: 无 txHash 扫码或交易所提现 - 智能链上探测匹配入账', async () => {
    const intent = await depositService.createDepositIntent({
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '50.0',
      userId: 'user-deposit-scan-01',
    });

    const matchRes = await depositService.scanAndMatchDeposit({
      orderId: intent.orderId,
      fromAddress: '0xPayerWalletFromExchange77777777',
    });

    expect(matchRes.success).toBe(true);
    expect(matchRes.status).toBe(OrderStatus.CONFIRMED);
    expect(matchRes.credited).toBe(true);
    expect(matchRes.txHash).toContain('0xMatchIncoming');
    expect(mockUserBalances.get('user-deposit-scan-01:ethereum:USDT')).toBe('50.0000');

    // 检查进度接口
    const prog = await depositService.getDepositProgress(intent.orderId);
    expect(prog.status).toBe(OrderStatus.CONFIRMED);
    expect(prog.progress).toBe(100);
    expect(prog.credited).toBe(true);
    expect(prog.pipelineSteps?.length).toBe(6);
  });
});
