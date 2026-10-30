import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SweepAdminController } from '../src/modules/transfer/sweep-admin.controller.js';
import { TransferController } from '../src/modules/transfer/transfer.controller.js';
import { SweepService, SweepDto } from '../src/modules/transfer/sweep.service.js';

describe('SweepAdminController - 后台专属归集控制器', () => {
  let adminController: SweepAdminController;
  let sweepService: SweepService;

  beforeEach(() => {
    sweepService = {
      sweepDepositFunds: vi.fn().mockResolvedValue({
        sweepId: 'test-sweep-id-123',
        network: 'ethereum',
        fromDepositWallet: '0xDepositAddress',
        toTargetAddress: '0xTreasuryVault',
        amount: '10.5',
        txHash: '0xSweepHash999',
        timestamp: Date.now(),
      }),
      getSweepableBalance: vi.fn().mockResolvedValue({
        network: 'ethereum',
        depositWallet: '0xDepositAddress',
        balance: '10.5',
        isValidDepositWallet: true,
      }),
    } as any;

    adminController = new SweepAdminController(sweepService);
  });

  it('POST /admin/sweep 应能被管理后台成功调用并触发资金归集', async () => {
    const sweepDto: SweepDto = {
      network: 'ethereum',
      fromDepositWallet: '0xDepositAddress',
      toTargetAddress: '0xTreasuryVault',
      amount: '10.5',
    };

    const result = await adminController.sweepFunds(sweepDto);
    expect(result.sweepId).toBe('test-sweep-id-123');
    expect(result.txHash).toBe('0xSweepHash999');
    expect(sweepService.sweepDepositFunds).toHaveBeenCalledWith(sweepDto);
  });

  it('GET /admin/sweep/balance/:network/:address 管理后台可查询待归集充值地址余额', async () => {
    const res = await adminController.getSweepableBalance('ethereum', '0xDepositAddress');
    expect(res.balance).toBe('10.5');
    expect(res.isValidDepositWallet).toBe(true);
    expect(sweepService.getSweepableBalance).toHaveBeenCalledWith('ethereum', '0xDepositAddress', undefined);
  });

  it('安全断言：前端面向普通用户的 TransferController 中绝对不包含任何归集 (sweep) 接口', () => {
    // 检查 TransferController 原型链，确保没有 sweepFunds 或类似接口
    const prototype = TransferController.prototype as any;
    expect(prototype.sweepFunds).toBeUndefined();
    expect(prototype.sweepDepositFunds).toBeUndefined();
    expect(prototype.sweep).toBeUndefined();
  });
});
