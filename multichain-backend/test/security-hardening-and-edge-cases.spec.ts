import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddressValidatorUtil } from '../src/common/utils/address-validator.util.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('Security Hardening and Edge Cases Audit Suite', () => {
  describe('1. Multi-chain Address Format Validation (AddressValidatorUtil)', () => {
    it('EVM 地址格式核验: 校验 0x 40位 Hex 格式', () => {
      // Valid addresses
      expect(AddressValidatorUtil.validate(ChainType.EVM, '0xdAC17F958D2ee523a2206206994597C13D831ec7').isValid).toBe(true);
      expect(AddressValidatorUtil.validate('ethereum', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266').isValid).toBe(true);

      // Invalid addresses
      expect(AddressValidatorUtil.validate(ChainType.EVM, '').isValid).toBe(false);
      expect(AddressValidatorUtil.validate(ChainType.EVM, '0xInvalidShort').isValid).toBe(false);
      expect(AddressValidatorUtil.validate(ChainType.EVM, 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT').isValid).toBe(false);
    });

    it('TRON 波场地址格式核验: 必须以 T 开头且长度 34 位 Base58', () => {
      // Valid Tron address
      expect(AddressValidatorUtil.validate(ChainType.TRON, 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT').isValid).toBe(true);
      expect(AddressValidatorUtil.validate('tron', 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb').isValid).toBe(true);

      // Invalid Tron address
      expect(AddressValidatorUtil.validate(ChainType.TRON, '0xdAC17F958D2ee523a2206206994597C13D831ec7').isValid).toBe(false);
      expect(AddressValidatorUtil.validate(ChainType.TRON, 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb').isValid).toBe(false);
      expect(AddressValidatorUtil.validate(ChainType.TRON, 'T123').isValid).toBe(false);
    });

    it('Solana 地址格式核验: 32-44位 Base58 编码，严禁以 0x 开头', () => {
      // Valid Solana address
      expect(AddressValidatorUtil.validate(ChainType.SOLANA, 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb').isValid).toBe(true);
      expect(AddressValidatorUtil.validate('solana', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM').isValid).toBe(true);

      // Invalid Solana address
      expect(AddressValidatorUtil.validate(ChainType.SOLANA, '0xdAC17F958D2ee523a2206206994597C13D831ec7').isValid).toBe(false);
      expect(AddressValidatorUtil.validate(ChainType.SOLANA, 'Short').isValid).toBe(false);
    });
  });

  describe('2. Withdrawal Service Input Hardening', () => {
    let withdrawService: WithdrawService;
    let mockSignerManager: any;
    let mockTransferService: any;
    let mockNetworkRegistry: any;
    let mockBalanceService: any;

    beforeEach(() => {
      mockSignerManager = {
        getRandomWithdrawWallet: vi.fn().mockResolvedValue({
          address: '0xHotVaultAddress88888888888888888888888888',
          providerType: 'KMS_ENCLAVE',
        }),
        getRandomWallet: vi.fn().mockResolvedValue({
          address: '0xHotVaultAddress88888888888888888888888888',
        }),
      };

      mockTransferService = {
        transfer: vi.fn().mockResolvedValue({
          success: true,
          txHash: '0xTx_Valid_Withdrawal_Success_111',
          blockNumber: 19850999,
        }),
      };

      mockNetworkRegistry = {
        getNetwork: vi.fn().mockReturnValue({
          networkId: 'ethereum',
          name: 'Ethereum',
          family: 'EVM',
          security: { isPaused: false },
        }),
      };

      mockBalanceService = {
        getSingleBalance: vi.fn().mockResolvedValue('500.0'),
        debitBalance: vi.fn().mockResolvedValue({ balance: '450.0' }),
        creditBalance: vi.fn().mockResolvedValue({ balance: '500.0' }),
      };

      withdrawService = new WithdrawService(
        mockSignerManager,
        mockTransferService,
        mockNetworkRegistry,
        undefined,
        mockBalanceService,
        undefined,
        undefined,
      );
    });

    it('拒绝非法/负数/NaN 提现金额，杜绝溢出攻击', async () => {
      await expect(
        withdrawService.createWithdrawal('user-audit-1', {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '-50.0',
          toAddress: '0xValidAddress111111111111111111111111111111',
        }),
      ).rejects.toThrow('提现金额不合法');

      await expect(
        withdrawService.createWithdrawal('user-audit-1', {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: 'NaN',
          toAddress: '0xValidAddress111111111111111111111111111111',
        }),
      ).rejects.toThrow('提现金额不合法');

      await expect(
        withdrawService.createWithdrawal('user-audit-1', {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: 'Infinity',
          toAddress: '0xValidAddress111111111111111111111111111111',
        }),
      ).rejects.toThrow('提现金额不合法');
    });

    it('提现接收地址跨公链混用拦截: EVM 提现填入 Solana 错链地址直接拒绝', async () => {
      await expect(
        withdrawService.createWithdrawal('user-audit-1', {
          network: 'ethereum',
          tokenSymbol: 'USDT',
          amount: '50.0',
          toAddress: 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb', // Solana address on EVM
        }),
      ).rejects.toThrow('提现接收地址格式不符合');

      // 验证未发生余额扣减
      expect(mockBalanceService.debitBalance).not.toHaveBeenCalled();
    });
  });
});
