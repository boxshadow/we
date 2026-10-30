import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { WithdrawalReconciliationService } from '../src/modules/transfer/withdrawal-reconciliation.service.js';
import { BalanceService } from '../src/modules/balance/balance.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('方案 C: 本地确定性预计算与双轨监听对账引擎测试 (Scheme C: Deterministic Pre-calculation & Dual-Track Reconciliation)', () => {
  let withdrawService: WithdrawService;
  let reconciliationService: WithdrawalReconciliationService;
  let balanceService: BalanceService;
  let networkRegistry: NetworkRegistryService;
  let mockSignerManager: any;
  let mockTransferService: any;
  let mockWithdrawWalletService: any;
  let mockTokenConfigService: any;

  let currentVaultOnChainNonce = 10;
  let simulateRpcTimeout = false;
  let simulateReceiptReady = false;

  beforeEach(() => {
    networkRegistry = new NetworkRegistryService();
    balanceService = new BalanceService();
    currentVaultOnChainNonce = 10;
    simulateRpcTimeout = false;
    simulateReceiptReady = false;

    mockSignerManager = {
      getRandomWithdrawWallet: vi.fn().mockImplementation(() => ({
        id: 'withdraw-evm-vault-01',
        address: '0xWithdrawHotVaultAddress11111111111111111',
        providerType: 'RUST_KMS_SGX',
      })),
      getRandomWallet: vi.fn().mockImplementation(() => ({
        address: '0xDefaultVaultAddress0000000000000000',
      })),
    };

    mockWithdrawWalletService = {
      getRandomActiveWithdrawWallet: vi.fn().mockImplementation(async () => ({
        id: 'withdraw-evm-vault-01',
        address: '0xWithdrawHotVaultAddress11111111111111111',
        providerType: 'RUST_KMS_SGX',
      })),
    };

    mockTokenConfigService = {
      findToken: vi.fn().mockImplementation(async () => ({
        symbol: 'USDT',
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        isActive: true,
        minDeposit: '5.0',
      })),
    };

    mockTransferService = {
      transfer: vi.fn().mockImplementation(async (_chain: string, dto: any) => {
        // 本地确定性算出的固定哈希
        const localPreCalculatedTxHash = '0xPreCalculatedTxHash99999999999999999999999999999999';
        const assignedNonce = currentVaultOnChainNonce;

        if (simulateRpcTimeout) {
          // 模拟 RPC 节点发送后没有返回响应 (Socket Hang Up / 504 Timeout)
          // 但交易很可能已进入全网交易池
          return {
            success: true,
            txHash: localPreCalculatedTxHash,
            nonce: assignedNonce,
            isInFlight: true,
            warning: 'RPC 节点网络超时，已凭预计算哈希转入在途对账队列',
          };
        }

        return {
          success: true,
          txHash: localPreCalculatedTxHash,
          nonce: assignedNonce,
          isInFlight: false,
          blockNumber: 19851000,
        };
      }),

      verifyTx: vi.fn().mockImplementation(async () => {
        if (!simulateReceiptReady) {
          return { confirmed: false, status: 'PENDING' };
        }
        return {
          confirmed: true,
          status: 'SUCCESS',
          blockNumber: 19851050,
          rawReceipt: { status: 1 },
        };
      }),

      getNonce: vi.fn().mockImplementation(async () => {
        return currentVaultOnChainNonce;
      }),
    };

    withdrawService = new WithdrawService(
      mockSignerManager,
      mockTransferService,
      networkRegistry,
      mockTokenConfigService,
      balanceService,
      mockWithdrawWalletService,
      undefined,
    );

    reconciliationService = new WithdrawalReconciliationService(
      withdrawService,
      mockTransferService,
    );
  });

  it('场景 1: RPC 节点无返回/超时时，本地预计算 TxHash 生效，订单置为在途，绝不误触发回滚退款', async () => {
    const userId = 'user-timeout-test';
    await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '1000.0');

    // 触发超时模拟
    simulateRpcTimeout = true;

    const res = await withdrawService.createWithdrawal(userId, {
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '200.0',
      toAddress: '0xDestinationUserWallet88888888888888888888',
    });

    // 1. 验证成功拿到本地预计算的 TxHash
    expect(res.success).toBe(true);
    expect(res.txHash).toBe('0xPreCalculatedTxHash99999999999999999999999999999999');
    expect(res.isInFlight).toBe(true);
    expect(res.status).toBe(OrderStatus.CONFIRMING);

    // 2. 验证用户余额已被扣除为 800 USDT，绝对没有因超时被误退款回滚
    const balanceAfter = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
    expect(balanceAfter).toBe('800');

    // 3. 验证该订单已挂入在途队列
    const inFlightOrders = withdrawService.getInFlightOrders();
    expect(inFlightOrders.length).toBe(1);
    expect(inFlightOrders[0].txHash).toBe('0xPreCalculatedTxHash99999999999999999999999999999999');
  });

  it('场景 2: 双轨之 WebSocket 实时监听 - 监听到新块包含预计算 TxHash 毫秒级自动结单', async () => {
    const userId = 'user-ws-test';
    await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '500.0');
    simulateRpcTimeout = true;

    const res = await withdrawService.createWithdrawal(userId, {
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '100.0',
      toAddress: '0xDestinationUserWallet88888888888888888888',
    });
    expect(res.isInFlight).toBe(true);

    // 模拟 WebSocket 节点推送新块 19851088，区块交易列表中包含该预计算 TxHash
    const wsEventResult = await reconciliationService.handleWebSocketBlockEvent(
      'ethereum',
      19851088,
      [
        '0xStrangerTxHash11111111111111111111111111111111',
        '0xPreCalculatedTxHash99999999999999999999999999999999',
        '0xAnotherTxHash22222222222222222222222222222222',
      ],
    );

    // 1. 验证 WebSocket 匹配成功
    expect(wsEventResult.matchedCount).toBe(1);

    // 2. 验证订单状态跃迁为 CONFIRMED
    const progress = await withdrawService.getWithdrawalProgress(res.orderId);
    expect(progress.status).toBe(OrderStatus.CONFIRMED);
    expect(progress.blockNumber).toBe(19851088);

    // 3. 验证在途队列已清空
    expect(withdrawService.getInFlightOrders().length).toBe(0);
  });

  it('场景 3: 双轨之 HTTP 兜底 + Nonce 链上探测 - 探知金库 Nonce 已推进，自动救回假死订单', async () => {
    const userId = 'user-nonce-rescue-test';
    await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '500.0');
    simulateRpcTimeout = true;

    const res = await withdrawService.createWithdrawal(userId, {
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '150.0',
      toAddress: '0xDestinationUserWallet88888888888888888888',
    });

    const inFlightOrder = withdrawService.getInFlightOrders()[0];
    expect(inFlightOrder.nonce).toBe(10);

    // 模拟订单挂起超过 10 秒
    inFlightOrder.createdAt = Date.now() - 15000;

    // 模拟金库在区块链上的最新 Nonce 已经递增为 11（证明 Nonce 10 已经被打包入块）
    currentVaultOnChainNonce = 11;

    // 执行对账巡检
    const report = await reconciliationService.reconcileInFlightOrders();

    // 验证通过 Nonce 探针成功救回并确认
    expect(report.reconciledRescuedByNonce).toBe(1);
    const progress = await withdrawService.getWithdrawalProgress(res.orderId);
    expect(progress.status).toBe(OrderStatus.CONFIRMED);
  });

  it('场景 4: 确认未上链且超期，执行安全冲正后方可解冻退款', async () => {
    const userId = 'user-cancel-refund-test';
    await balanceService.creditBalance(userId, 'ethereum', 'USDT', null, '300.0');
    simulateRpcTimeout = true;

    const res = await withdrawService.createWithdrawal(userId, {
      network: 'ethereum',
      tokenSymbol: 'USDT',
      amount: '100.0',
      toAddress: '0xDestinationUserWallet88888888888888888888',
    });

    // 此时余额扣减至 200
    expect(await balanceService.getSingleBalance(userId, 'ethereum', 'USDT')).toBe('200');

    // 确认链上未生效后执行安全冲正
    await reconciliationService.manualCancelWithHardReplace(
      res.orderId,
      '测试安全冲正解冻退款',
    );

    // 验证订单置为 FAILED，且资金已安全回滚至 300
    const progress = await withdrawService.getWithdrawalProgress(res.orderId);
    expect(progress.status).toBe(OrderStatus.FAILED);
    expect(await balanceService.getSingleBalance(userId, 'ethereum', 'USDT')).toBe('300');
  });
});
