import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepositWalletService } from '../src/modules/wallet/deposit-wallet.service.js';
import { TokenConfigService } from '../src/modules/token/token-config.service.js';
import { BalanceService } from '../src/modules/balance/balance.service.js';
import { DepositService } from '../src/modules/transfer/deposit.service.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { TransferService } from '../src/modules/transfer/transfer.service.js';
import { WalletSignerManager } from '../src/modules/wallet/wallet-signer.manager.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';
import { OrderStatus } from '../src/modules/transfer/types/order.types.js';

describe('Deposit & Multi-Token Balance Architecture', () => {
  let depositWalletService: DepositWalletService;
  let tokenConfigService: TokenConfigService;
  let balanceService: BalanceService;
  let depositService: DepositService;
  let networkRegistryMock: Partial<NetworkRegistryService>;
  let transferServiceMock: Partial<TransferService>;
  let walletSignerManagerMock: Partial<WalletSignerManager>;

  beforeEach(() => {
    networkRegistryMock = {
      getNetwork: vi.fn().mockImplementation((netId: string) => ({
        networkId: netId,
        name: `${netId} Testnet`,
        family: netId === 'tron' ? ChainType.TRON : netId === 'solana' ? ChainType.SOLANA : ChainType.EVM,
        security: { isPaused: false },
        nativeCurrency: { symbol: netId === 'tron' ? 'TRX' : netId === 'solana' ? 'SOL' : 'ETH' },
      })),
    };

    transferServiceMock = {
      verifyTx: vi.fn(),
      getBalance: vi.fn().mockResolvedValue('50.0'),
    };

    walletSignerManagerMock = {
      getRandomDepositWallet: vi.fn().mockResolvedValue({
        address: '0xDefaultDepositWallet1111111111111111111111',
        chain: ChainType.EVM,
        purpose: 'DEPOSIT',
      }),
    };

    depositWalletService = new DepositWalletService(
      networkRegistryMock as NetworkRegistryService,
    );

    tokenConfigService = new TokenConfigService(
      networkRegistryMock as NetworkRegistryService,
    );

    balanceService = new BalanceService();

    depositService = new DepositService(
      walletSignerManagerMock as WalletSignerManager,
      transferServiceMock as TransferService,
      networkRegistryMock as NetworkRegistryService,
      depositWalletService,
      tokenConfigService,
      balanceService,
    );
  });

  describe('1. 管理后台配置多个链的钱包 (Deposit Wallets)', () => {
    it('应该能够为指定公链添加多个充值钱包并能够查询', async () => {
      const w1 = await depositWalletService.addWallet({
        networkId: 'ethereum',
        address: '0xEthDepositWallet111111111111111111111111',
        label: '以太坊充值地址 A1',
      });
      const w2 = await depositWalletService.addWallet({
        networkId: 'ethereum',
        address: '0xEthDepositWallet222222222222222222222222',
        label: '以太坊充值地址 A2',
      });
      const wTron = await depositWalletService.addWallet({
        networkId: 'tron',
        address: 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT',
        label: '波场充值地址 T1',
      });

      expect(w1.address).toBe('0xEthDepositWallet111111111111111111111111');
      expect(w2.address).toBe('0xEthDepositWallet222222222222222222222222');
      expect(wTron.address).toBe('TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT');

      const ethWallets = await depositWalletService.listWallets('ethereum');
      expect(ethWallets.length).toBe(2);

      const tronWallets = await depositWalletService.listWallets('tron');
      expect(tronWallets.length).toBe(1);
    });

    it('应该能够启停充值钱包激活状态，且只从激活状态的钱包中随机分配', async () => {
      const w1 = await depositWalletService.addWallet({
        networkId: 'bsc',
        address: '0xBscDepositWallet111111111111111111111111',
      });
      const w2 = await depositWalletService.addWallet({
        networkId: 'bsc',
        address: '0xBscDepositWallet222222222222222222222222',
      });

      // 禁用 w1
      await depositWalletService.toggleActive(w1.id, false);

      const actives = await depositWalletService.getActiveWallets('bsc');
      expect(actives.length).toBe(1);
      expect(actives[0].address).toBe('0xBscDepositWallet222222222222222222222222');

      const randomWallet = await depositWalletService.getRandomActiveDepositWallet('bsc');
      expect(randomWallet.address).toBe('0xBscDepositWallet222222222222222222222222');
    });
  });

  describe('2. 管理后台配置多种 Token (Supported Tokens)', () => {
    it('应该能够配置代币符号、名字、合约地址与精度', async () => {
      const usdt = await tokenConfigService.addToken({
        networkId: 'ethereum',
        symbol: 'USDT',
        name: 'Tether USD',
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        minDeposit: '5.0',
      });

      expect(usdt.symbol).toBe('USDT');
      expect(usdt.decimals).toBe(6);
      expect(usdt.contractAddress).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');

      const found = await tokenConfigService.findToken('ethereum', 'usdt');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Tether USD');
    });

    it('添加重复代币应该抛出异常', async () => {
      await tokenConfigService.addToken({
        networkId: 'tron',
        symbol: 'USDT',
        name: 'Tether USD TRC20',
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });

      await expect(
        tokenConfigService.addToken({
          networkId: 'tron',
          symbol: 'usdt',
          name: 'Duplicate USDT',
        }),
      ).rejects.toThrow();
    });
  });

  describe('3. 用户多链各 Token 余额独立存放 (Token Balance System)', () => {
    it('不同 Token 的余额应该严格独立存放，互不干扰', async () => {
      const userId = 'user-uuid-1001';

      // 充值 100 USDT (Ethereum)
      await balanceService.creditBalance(userId, 'ethereum', 'USDT', '0xdAC1...', '100.0');

      // 充值 2.5 ETH (Ethereum)
      await balanceService.creditBalance(userId, 'ethereum', 'ETH', null, '2.5');

      // 充值 50 USDT (Tron)
      await balanceService.creditBalance(userId, 'tron', 'USDT', 'TR7N...', '50.0');

      const balances = await balanceService.getUserBalances(userId);
      expect(balances.length).toBe(3);

      const usdtEth = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(usdtEth).toBe('100');

      const eth = await balanceService.getSingleBalance(userId, 'ethereum', 'ETH');
      expect(eth).toBe('2.5');

      const usdtTron = await balanceService.getSingleBalance(userId, 'tron', 'USDT');
      expect(usdtTron).toBe('50');

      // 再次充值 50.5 USDT (Ethereum) -> 应该累加为 150.5
      await balanceService.creditBalance(userId, 'ethereum', 'USDT', '0xdAC1...', '50.5');
      const updatedUsdtEth = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(updatedUsdtEth).toBe('150.5');
    });
  });

  describe('4. 充值核验全流程 (带 txHash 与无 txHash 智能对账)', () => {
    it('场景 A：带有效 txHash 充值，验证通过后成功给用户余额充值', async () => {
      // 1. 配置钱包与代币
      const wallet = await depositWalletService.addWallet({
        networkId: 'ethereum',
        chain: 'EVM',
        address: '0x8888888888888888888888888888888888888888',
      });
      await tokenConfigService.addToken({
        networkId: 'ethereum',
        symbol: 'USDT',
        name: 'Tether USD',
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        decimals: 6,
      });

      const userId = 'user-uuid-888';

      // 2. 创建充值意图
      const intent = await depositService.createDepositIntent({
        userId,
        network: 'ethereum',
        amount: '20.0',
        tokenSymbol: 'USDT',
      });
      expect(intent.orderId).toBeDefined();
      expect(intent.tokenSymbol).toBe('USDT');
      expect(intent.depositAddress).toBe(wallet.address);

      // 3. 模拟链上真实转账收据匹配
      (transferServiceMock.verifyTx as any).mockResolvedValue({
        confirmed: true,
        to: wallet.address,
        from: '0xUserPayer11111111111111111111111111111111',
        amount: '20.0',
        tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      });

      // 4. 前端提交 txHash 进行确认
      const result = await depositService.verifyAndConfirmDeposit({
        orderId: intent.orderId,
        txHash: '0xTxHashValidDeposit999',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(result.credited).toBe(true);
      expect(result.newBalance).toBe('20');

      // 验证用户余额
      const currentBalance = await balanceService.getSingleBalance(userId, 'ethereum', 'USDT');
      expect(currentBalance).toBe('20');

      // 5. 防重放校验：若在新的充值订单中恶意重放使用已入账过的 txHash，必须被直接拒绝拦截
      const intent2 = await depositService.createDepositIntent({
        userId,
        network: 'ethereum',
        amount: '20.0',
        tokenSymbol: 'USDT',
      });

      await expect(
        depositService.verifyAndConfirmDeposit({
          orderId: intent2.orderId,
          txHash: '0xTxHashValidDeposit999',
        }),
      ).rejects.toThrow();
    });

    it('场景 B：无 txHash 情况下，智能链上对账匹配并增加用户余额', async () => {
      const wallet = await depositWalletService.addWallet({
        networkId: 'tron',
        address: 'TRXbmxAHAxHTcasDXvyF1fKvP1wxgCLSRH',
      });

      const userId = 'user-no-hash-777';

      const intent = await depositService.createDepositIntent({
        userId,
        network: 'tron',
        amount: '15.0',
      });

      (transferServiceMock.getBalance as any).mockResolvedValue('30.0');

      // 用户未获取到 txHash，发起自动智能对账
      const matchResult = await depositService.scanAndMatchDeposit({
        orderId: intent.orderId,
        fromAddress: 'TUserPayerAddress11111111111111111',
      });

      expect(matchResult.success).toBe(true);
      expect(matchResult.status).toBe(OrderStatus.CONFIRMED);
      expect(matchResult.credited).toBe(true);
      expect(matchResult.txHash).toContain('0xMatchIncoming_');

      // 验证余额已正确到账
      const userBal = await balanceService.getSingleBalance(userId, 'tron', 'TRX');
      expect(userBal).toBe('15');
    });
  });
});
