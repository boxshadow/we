import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepositService } from '../src/modules/transfer/deposit.service.js';
import { WithdrawService } from '../src/modules/transfer/withdraw.service.js';
import { SweepService } from '../src/modules/transfer/sweep.service.js';
import { TokenService } from '../src/modules/token/token.service.js';
import { WalletSignerManager } from '../src/modules/wallet/wallet-signer.manager.js';
import { LocalSignerProvider } from '../src/modules/wallet/providers/local-signer.provider.js';
import { RemoteKmsSignerProvider } from '../src/modules/wallet/providers/remote-kms-signer.provider.js';
import { EncryptedDbSignerProvider } from '../src/modules/wallet/providers/encrypted-db-signer.provider.js';
import { TransferService } from '../src/modules/transfer/transfer.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';
import { TxStatus } from '../src/common/enums/tx-status.enum.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';
import { WalletPurpose } from '../src/modules/wallet/interfaces/wallet-account.interface.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';

describe('Strict Wallet Purpose Isolation (Deposit / Withdraw / Token Deploy)', () => {
  let signerManager: WalletSignerManager;
  let localProvider: LocalSignerProvider;
  let remoteKmsProvider: RemoteKmsSignerProvider;
  let encryptedDbProvider: EncryptedDbSignerProvider;
  let transferService: TransferService;
  let depositService: DepositService;
  let withdrawService: WithdrawService;
  let sweepService: SweepService;
  let tokenService: TokenService;

  const depositWalletAddress = '0xDepositOnlyWallet111111111111111111111111';
  const withdrawWalletAddress = '0xWithdrawOnlyKmsWallet222222222222222222222';
  const deployerWalletAddress = '0xTokenDeployerWallet3333333333333333333333';

  let mockEvmAdapter: any;

  beforeEach(() => {
    localProvider = new LocalSignerProvider();
    remoteKmsProvider = new RemoteKmsSignerProvider();
    encryptedDbProvider = new EncryptedDbSignerProvider();

    // 1. 注册纯充值入金钱包 (DEPOSIT ONLY)
    localProvider.addRecord(
      {
        id: 'evm-deposit-wallet-1',
        chain: ChainType.EVM,
        address: depositWalletAddress,
        providerType: 'LOCAL',
        purpose: WalletPurpose.DEPOSIT,
      },
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    );

    // 2. 注册纯出金付款钱包 (WITHDRAW ONLY - 通过 KMS 托管)
    remoteKmsProvider.registerRemoteWallet({
      id: 'kms-withdraw-vault-1',
      chain: ChainType.EVM,
      address: withdrawWalletAddress,
      providerType: 'REMOTE_KMS',
      purpose: WalletPurpose.WITHDRAW,
      metadata: { vaultId: 'fb-vault-withdraw-pool' },
    });

    // 3. 注册纯发币部署钱包 (TOKEN_DEPLOY ONLY)
    localProvider.addRecord(
      {
        id: 'evm-deployer-wallet-1',
        chain: ChainType.EVM,
        address: deployerWalletAddress,
        providerType: 'LOCAL',
        purpose: WalletPurpose.TOKEN_DEPLOY,
      },
      '0x0000000000000000000000000000000000000000000000000000000000000003',
    );

    signerManager = new WalletSignerManager(localProvider, remoteKmsProvider, encryptedDbProvider);

    transferService = {
      verifyTx: vi.fn(),
      transfer: vi.fn(),
      getBalance: vi.fn().mockResolvedValue('100.0'),
    } as any;

    mockEvmAdapter = {
      deployToken: vi.fn().mockResolvedValue({
        txResult: { success: true, txHash: '0xDeployTxHash123' },
        tokenAddress: '0xNewContractTokenAddress',
      }),
    };

    const networkRegistry = new NetworkRegistryService();
    depositService = new DepositService(signerManager, transferService, networkRegistry);
    withdrawService = new WithdrawService(signerManager, transferService, networkRegistry);
    sweepService = new SweepService(signerManager, transferService, networkRegistry);
    tokenService = new TokenService(
      mockEvmAdapter,
      {} as any,
      {} as any,
      signerManager,
      networkRegistry,
    );
  });

  describe('1. 充值入金隔离性 (Deposit Isolation)', () => {
    it('充值必须且只能匹配 DEPOSIT 钱包，绝对不会把出金热钱包给用户充值', async () => {
      const intent = await depositService.createDepositIntent({
        network: ChainType.EVM,
        amount: '10.5',
        tokenAddress: '0xUSDTAddress',
      });

      expect(intent.orderId).toBeDefined();
      expect(intent.depositAddress.toLowerCase()).toBe(depositWalletAddress.toLowerCase());
      expect(intent.depositAddress.toLowerCase()).not.toBe(withdrawWalletAddress.toLowerCase());
      expect(intent.depositAddress.toLowerCase()).not.toBe(deployerWalletAddress.toLowerCase());
    });

    it('有效交易验证通过后，正常更新订单为 CONFIRMED', async () => {
      const intent = await depositService.createDepositIntent({
        network: ChainType.EVM,
        amount: '10.5',
        tokenAddress: '0xUSDTAddress',
      });

      vi.mocked(transferService.verifyTx).mockResolvedValueOnce({
        confirmed: true,
        blockNumber: 1234567,
        status: TxStatus.CONFIRMED,
        to: intent.depositAddress,
        from: '0xUserWalletAddress',
        amount: '10.5',
        tokenAddress: '0xUSDTAddress',
      });

      const res = await depositService.verifyAndConfirmDeposit({
        orderId: intent.orderId,
        txHash: '0xValidTxHash123',
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('2. 出金提现隔离性 (Withdraw Isolation)', () => {
    it('出金必须且只能由 WITHDRAW 钱包付款，绝对不会调用充值钱包或发币钱包出款', async () => {
      vi.mocked(transferService.transfer).mockResolvedValueOnce({
        success: true,
        txHash: '0xWithdrawTxHash999',
      });

      const result = await withdrawService.processWithdrawal({
        network: ChainType.EVM,
        userAddress: '0xUserDestinationAddress',
        amount: '5.0',
        tokenAddress: '0xTokenContract',
      });

      expect(result.txHash).toBe('0xWithdrawTxHash999');
      expect(result.fromWallet.toLowerCase()).toBe(withdrawWalletAddress.toLowerCase());
      expect(result.fromWallet.toLowerCase()).not.toBe(depositWalletAddress.toLowerCase());
      expect(result.fromWallet.toLowerCase()).not.toBe(deployerWalletAddress.toLowerCase());

      expect(transferService.transfer).toHaveBeenCalledWith(
        ChainType.EVM,
        expect.objectContaining({
          to: '0xUserDestinationAddress',
          amount: '5.0',
          signerWallet: expect.objectContaining({
            address: withdrawWalletAddress,
            purpose: WalletPurpose.WITHDRAW,
          }),
        }),
      );
    });
  });

  describe('3. 发币专属钱包隔离性 (Token Deployer Isolation)', () => {
    it('发币必须且只能由 TOKEN_DEPLOY 专用钱包签署部署，严禁与出入金混用', async () => {
      const res = await tokenService.deployToken(ChainType.EVM, {
        name: 'My Security Token',
        symbol: 'MST',
        decimals: 18,
        initialSupply: '1000000',
      });

      expect(res.txResult.success).toBe(true);
      expect(res.tokenAddress).toBe('0xNewContractTokenAddress');

      // 验证底层 adapter 接收到的部署者钱包正是 TOKEN_DEPLOY 钱包
      expect(mockEvmAdapter.deployToken).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Security Token',
          symbol: 'MST',
          signerWallet: expect.objectContaining({
            address: deployerWalletAddress,
            purpose: WalletPurpose.TOKEN_DEPLOY,
          }),
          recipient: deployerWalletAddress,
        }),
      );
    });

    it('安全拦截：严禁将充值钱包或出金钱包强行作为发币部署人', async () => {
      const depositWallet = (await signerManager.getDepositWallets(ChainType.EVM))[0];

      await expect(
        tokenService.deployToken(ChainType.EVM, {
          name: 'Illegal Token',
          symbol: 'ILL',
          decimals: 18,
          initialSupply: '100',
          signerWallet: depositWallet, // 尝试用充值钱包发币
        }),
      ).rejects.toThrow('Security Violation');
    });
  });

  describe('4. 资金归集闭环 (Fund Sweeping)', () => {
    it('允许将资金从充值专属钱包 (DEPOSIT) 归集转移到金库或出金热钱包', async () => {
      vi.mocked(transferService.transfer).mockResolvedValueOnce({
        success: true,
        txHash: '0xSweepTxHash777',
      });

      const res = await sweepService.sweepDepositFunds({
        network: ChainType.EVM,
        fromDepositWallet: depositWalletAddress,
        toTargetAddress: withdrawWalletAddress,
        tokenAddress: '0xUSDTAddress',
        amount: '50.0',
      });

      expect(res.txHash).toBe('0xSweepTxHash777');
      expect(res.fromDepositWallet).toBe(depositWalletAddress);
      expect(res.toTargetAddress).toBe(withdrawWalletAddress);
      expect(res.amount).toBe('50.0');
    });

    it('安全拦截：严禁对出金热钱包 (WITHDRAW) 发起归集操作', async () => {
      await expect(
        sweepService.sweepDepositFunds({
          network: ChainType.EVM,
          fromDepositWallet: withdrawWalletAddress,
          toTargetAddress: '0xColdTreasuryVault',
          amount: '10.0',
        }),
      ).rejects.toThrow('Security Violation');
    });
  });
});
