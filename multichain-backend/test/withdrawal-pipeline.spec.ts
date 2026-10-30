import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('提现全盘链路端到端自动化测试 (Comprehensive Withdrawal Pipeline)', () => {
  let withdrawService: WithdrawService;
  let networkRegistry: NetworkRegistryService;
  let mockSignerManager: any;
  let mockTransferService: any;
  let mockBalanceService: any;
  let mockWithdrawWalletService: any;

  const mockUserBalances = new Map<string, string>();

  beforeEach(() => {
    mockUserBalances.clear();
    mockUserBalances.set('user-alpha:ethereum:USDT', '1000.0');
    mockUserBalances.set('user-alpha:solana:SOL', '50.0');
    mockUserBalances.set('user-alpha:tron:USDT', '500.0');

    networkRegistry = new NetworkRegistryService();

    mockSignerManager = {
      getRandomWallet: vi.fn().mockImplementation((family: string) => {
        return {
          id: `default-${family.toLowerCase()}-vault`,
          address: `0xDefault${family}VaultAddress0000000000000000`,
          providerType: 'LOCAL',
        };
      }),
      getRandomWithdrawWallet: vi.fn().mockImplementation((family: string) => {
        return {
          id: `withdraw-${family.toLowerCase()}-vault-01`,
          address: `0xWithdraw${family}VaultAddress1111111111111111`,
          providerType: 'KMS_NATIVE_ENCLAVE',
        };
      }),
    };

    mockTransferService = {
      transfer: vi.fn().mockImplementation(async (_chain: string, dto: any) => {
        if (dto.to.includes('fail')) {
          return { success: false, txHash: '', error: 'RPC execution reverted: execution out of gas' };
        }
        return {
          success: true,
          txHash: `0xWithdrawBroadcastTxHash_${Date.now()}_999`,
          blockNumber: 19842100,
        };
      }),
    };

    mockBalanceService = {
      getSingleBalance: vi.fn().mockImplementation(async (userId: string, netId: string, symbol: string) => {
        const key = `${userId}:${netId}:${symbol}`;
        return mockUserBalances.get(key) || '0.0';
      }),
      debitBalance: vi.fn().mockImplementation(async (userId: string, netId: string, symbol: string, amount: string) => {
        const key = `${userId}:${netId}:${symbol}`;
        const current = parseFloat(mockUserBalances.get(key) || '0.0');
        const next = (current - parseFloat(amount)).toFixed(4);
        mockUserBalances.set(key, next);
        return next;
      }),
      creditBalance: vi.fn().mockImplementation(async (userId: string, netId: string, symbol: string, _tokenAddress: any, amount: string) => {
        const key = `${userId}:${netId}:${symbol}`;
        const current = parseFloat(mockUserBalances.get(key) || '0.0');
        const next = (current + parseFloat(amount)).toFixed(4);
        mockUserBalances.set(key, next);
        return next;
      }),
    };

    mockWithdrawWalletService = {
      getRandomActiveWithdrawWallet: vi.fn().mockImplementation(async (family: string) => {
        return {
          id: `active-${family.toLowerCase()}-hot-vault`,
          address: `0xActive${family}HotVault888888888888888888`,
          providerType: 'RUST_KMS_SGX',
        };
      }),
    };

    withdrawService = new WithdrawService(
      mockSignerManager,
      mockTransferService,
      networkRegistry,
      undefined, // tokenConfigService
      mockBalanceService,
      mockWithdrawWalletService,
      undefined, // prisma
    );
  });

  it('链路阶段 1: 参数与地址校验 - 无效地址或金额小于等于0应被拒绝', async () => {
    await expect(
      withdrawService.createWithdrawal('user-alpha', {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '0',
        toAddress: '0xValidRecipientAddress11111111111111111111',
      }),
    ).rejects.toThrow('提现金额不合法');

    await expect(
      withdrawService.createWithdrawal('user-alpha', {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '10.0',
        toAddress: 'short',
      }),
    ).rejects.toThrow('提现接收地址无效');
  });

  it('链路阶段 2: 余额核验 - 用户余额不足时应立即阻断，不产生任何扣款与签名', async () => {
    await expect(
      withdrawService.createWithdrawal('user-alpha', {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '99999.0', // Exceeds 1000.0 balance
        toAddress: '0xValidRecipientAddress11111111111111111111',
      }),
    ).rejects.toThrow('资产余额不足');

    expect(mockUserBalances.get('user-alpha:ethereum:USDT')).toBe('1000.0');
    expect(mockTransferService.transfer).not.toHaveBeenCalled();
  });

  it('链路完整成功流: 发起 -> 校验 -> 扣减 -> 匹配金库 -> 加签 -> 广播 -> 记录阶段步骤', async () => {
    const res = await withdrawService.createWithdrawal('user-alpha', {
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '50.0',
      toAddress: '0xValidRecipientAddress11111111111111111111',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe(OrderStatus.CONFIRMED);
    expect(res.amount).toBe('50.0');
    expect(res.txHash).toContain('0xWithdrawBroadcastTxHash');
    expect(res.fromVault).toContain('0xActive');

    // 检查余额已被扣减
    expect(mockUserBalances.get('user-alpha:ethereum:USDT')).toBe('950.0000');

    // 检查步骤明细是否完整包含全部阶段
    expect(res.pipelineSteps).toBeDefined();
    expect(res.pipelineSteps?.length).toBe(6);
    expect(res.pipelineSteps?.[0].name).toBe('参数与地址校验');
    expect(res.pipelineSteps?.[1].name).toBe('余额核验与资产锁定');
    expect(res.pipelineSteps?.[2].name).toBe('智能匹配出资热钱包');
    expect(res.pipelineSteps?.[3].name).toBe('安全 Enclave 物理加签');
    expect(res.pipelineSteps?.[4].name).toBe('公链节点广播入块');
    expect(res.pipelineSteps?.[5].name).toBe('区块打包与确认');

    // 检查实时进度查询接口
    const progress = await withdrawService.getWithdrawalProgress(res.orderId);
    expect(progress.status).toBe(OrderStatus.CONFIRMED);
    expect(progress.progress).toBe(100);
    expect(progress.txHash).toBe(res.txHash);
    expect(progress.pipelineSteps?.length).toBe(6);
  });

  it('链路失败与原子补偿回滚: 当链上广播或加签失败时，必须全额原路退还余额', async () => {
    await expect(
      withdrawService.createWithdrawal('user-alpha', {
        network: 'ethereum',
        tokenSymbol: 'USDT',
        amount: '80.0',
        toAddress: '0xTargetDestinationWith_fail_Flag1111111',
      }),
    ).rejects.toThrow('提现出金链上广播失败');

    // 检查资金是否已被原子补偿退还原路 (1000.0)
    expect(mockUserBalances.get('user-alpha:ethereum:USDT')).toBe('1000.0000');

    // 查询所有订单检查失败记录
    const orders = await withdrawService.getUserWithdrawals('user-alpha');
    const failedOrder = orders.find((o) => o.amount === '80.0');
    expect(failedOrder).toBeDefined();
    expect(failedOrder?.status).toBe(OrderStatus.FAILED);
    expect(failedOrder?.pipelineSteps?.some((s) => s.status === 'FAILED')).toBe(true);
    expect(failedOrder?.pipelineSteps?.some((s) => s.name === '资金原子补偿与回滚')).toBe(true);
  });

  it('多链兼容支持: Solana 与 Tron 链路均能正常流转', async () => {
    // Solana 提现
    const solRes = await withdrawService.createWithdrawal('user-alpha', {
      network: 'solana',
      tokenSymbol: 'SOL',
      amount: '5.0',
      toAddress: 'SolanaUserRecipientAddress11111111111111111',
    });
    expect(solRes.success).toBe(true);
    expect(mockUserBalances.get('user-alpha:solana:SOL')).toBe('45.0000');

    // Tron 提现
    const tronRes = await withdrawService.createWithdrawal('user-alpha', {
      network: 'tron',
      tokenSymbol: 'USDT',
      amount: '100.0',
      toAddress: 'TRONUserRecipientAddress11111111111111111',
    });
    expect(tronRes.success).toBe(true);
    expect(mockUserBalances.get('user-alpha:tron:USDT')).toBe('400.0000');
  });
});
