import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import {
  WalletAccount,
  SignerProviderType,
  WalletPurpose,
} from './interfaces/wallet-account.interface.js';
import {
  ISignerProvider,
  EvmSignRequest,
  SolanaSignRequest,
  TronSignRequest,
} from './interfaces/signer-provider.interface.js';
import { LocalSignerProvider } from './providers/local-signer.provider.js';
import { RemoteKmsSignerProvider } from './providers/remote-kms-signer.provider.js';
import { EncryptedDbSignerProvider } from './providers/encrypted-db-signer.provider.js';
import { EncryptionServiceService } from './encryption-service.service.js';
import type { Hex } from 'viem';
import { Transaction } from '@solana/web3.js';

@Injectable()
export class WalletSignerManager {
  private readonly logger = new Logger(WalletSignerManager.name);
  private providers = new Map<SignerProviderType, ISignerProvider>();

  constructor(
    private readonly localProvider: LocalSignerProvider,
    private readonly remoteKmsProvider: RemoteKmsSignerProvider,
    private readonly encryptedDbProvider: EncryptedDbSignerProvider,
    @Optional() private readonly encryptionService?: EncryptionServiceService,
  ) {
    this.registerProvider(localProvider);
    this.registerProvider(remoteKmsProvider);
    this.registerProvider(encryptedDbProvider);
  }

  registerProvider(provider: ISignerProvider) {
    this.providers.set(provider.providerType, provider);
    this.logger.log(`Registered SignerProvider: ${provider.providerType}`);
  }

  private getProvider(type: SignerProviderType): ISignerProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new NotFoundException(`SignerProvider ${type} is not registered`);
    }
    return provider;
  }

  /**
   * Fetch all wallets across all active providers for a given chain
   */
  async getAllWallets(chain: ChainType): Promise<WalletAccount[]> {
    const allWallets: WalletAccount[] = [];
    for (const provider of this.providers.values()) {
      const wallets = await provider.getWallets(chain);
      allWallets.push(...wallets);
    }
    return allWallets;
  }

  /**
   * Get all dedicated deposit wallets for a chain
   */
  async getDepositWallets(chain: ChainType): Promise<WalletAccount[]> {
    const all = await this.getAllWallets(chain);
    return all.filter((w) => w.purpose === WalletPurpose.DEPOSIT);
  }

  /**
   * Get all dedicated withdraw wallets for a chain
   */
  async getWithdrawWallets(chain: ChainType): Promise<WalletAccount[]> {
    const all = await this.getAllWallets(chain);
    return all.filter((w) => w.purpose === WalletPurpose.WITHDRAW);
  }

  /**
   * Get all dedicated deployer wallets for a chain
   */
  async getDeployerWallets(chain: ChainType): Promise<WalletAccount[]> {
    const all = await this.getAllWallets(chain);
    return all.filter((w) => w.purpose === WalletPurpose.TOKEN_DEPLOY);
  }

  /**
   * General random wallet fallback (defaults to withdraw wallet)
   */
  async getRandomWallet(chain: ChainType): Promise<WalletAccount> {
    return this.getRandomWithdrawWallet(chain);
  }

  /**
   * 严格获取发币专属部署钱包 (Token Deployer Wallet)
   * 规则：只允许从 purpose === TOKEN_DEPLOY 的池子中选取，严禁混入充值或出金钱包！
   */
  async getRandomDeployerWallet(chain: ChainType): Promise<WalletAccount> {
    const deployerWallets = await this.getDeployerWallets(chain);

    if (deployerWallets.length === 0) {
      throw new Error(
        `[Security Alert] No dedicated TOKEN_DEPLOY wallets configured for chain: ${chain}`,
      );
    }

    const randomIndex = Math.floor(Math.random() * deployerWallets.length);
    const chosen = deployerWallets[randomIndex];
    this.logger.log(
      `[Deployer Routing] Selected dedicated Token Deployer Wallet: [${chain}] ${chosen.address} (Id: ${chosen.id}, Provider: ${chosen.providerType})`,
    );
    return chosen;
  }

  /**
   * 严格获取充值入金钱包 (Wallet A)
   * 规则：只允许从 purpose === DEPOSIT 的池子中随机选取，严禁混入出金钱包！
   */
  async getRandomDepositWallet(chain: ChainType): Promise<WalletAccount> {
    const depositWallets = await this.getDepositWallets(chain);

    if (depositWallets.length === 0) {
      throw new Error(`[Security Alert] No dedicated DEPOSIT wallets configured for chain: ${chain}`);
    }

    const randomIndex = Math.floor(Math.random() * depositWallets.length);
    const chosen = depositWallets[randomIndex];
    this.logger.log(
      `[Deposit Routing] Selected dedicated Deposit Wallet A: [${chain}] ${chosen.address} (Id: ${chosen.id}, Provider: ${chosen.providerType})`,
    );
    return chosen;
  }

  /**
   * 严格获取提现出金钱包 (Wallet B)
   * 规则：只允许从 purpose === WITHDRAW 的池子中选取，严禁将充值钱包用于出金！
   * 并且执行链上余额巡检，过滤出真正有足够余额的热钱包。
   */
  async getRandomWithdrawWallet(
    chain: ChainType,
    balanceChecker?: (wallet: WalletAccount) => Promise<boolean>,
  ): Promise<WalletAccount> {
    const withdrawWallets = await this.getWithdrawWallets(chain);

    if (withdrawWallets.length === 0) {
      throw new Error(`[Security Alert] No dedicated WITHDRAW wallets configured for chain: ${chain}`);
    }

    if (balanceChecker) {
      const candidates = [...withdrawWallets].sort(() => Math.random() - 0.5);
      for (const candidate of candidates) {
        const hasBalance = await balanceChecker(candidate);
        if (hasBalance) {
          this.logger.log(
            `[Withdraw Routing] Selected dedicated Withdraw Wallet B (with sufficient balance): [${chain}] ${candidate.address} (Id: ${candidate.id})`,
          );
          return candidate;
        }
      }
      this.logger.warn(`No withdraw wallet with sufficient balance found among ${withdrawWallets.length} candidates, falling back to random withdraw wallet`);
    }

    const randomIndex = Math.floor(Math.random() * withdrawWallets.length);
    const chosen = withdrawWallets[randomIndex];
    this.logger.log(
      `[Withdraw Routing] Selected dedicated Withdraw Wallet B: [${chain}] ${chosen.address} (Id: ${chosen.id})`,
    );
    return chosen;
  }

  async getWalletByAddress(chain: ChainType, address: string): Promise<WalletAccount | undefined> {
    const wallets = await this.getAllWallets(chain);
    return wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
  }

  // ==================== Unified Signing Delegation & Intelligent Routing ====================

  /**
   * 智能解析当前生效的加签通道：
   * 1. 若管理后台配置的三方加密加签服务处于激活状态 (isActive === true)，所有出金提现交易加签强制路由至远程 KMS/MPC 服务；
   * 2. 若三方加签服务处于停用状态：
   *    - 若配置了严格熔断 (REJECT_ALL)，抛出异常阻断出金加签以保证资产安全；
   *    - 若配置了容灾降级 (LOCAL_BACKUP)，转由本地离线冷备私钥加签。
   */
  public resolveEffectiveProvider(wallet?: any): ISignerProvider {
    if (this.encryptionService) {
      const creds = this.encryptionService.getSignerCredentials();
      if (creds && creds.isActive) {
        this.logger.log(
          `[Signer Router]  三方外部加密服务处于激活状态 (Endpoint: ${creds.serviceUrl})，出金提现交易已由本地转接调度至【三方 KMS 外部签名服务】加签！`,
        );
        return this.remoteKmsProvider;
      }

      // 处于停用状态时的容灾策略判断
      const config = (this.encryptionService as any).config;
      if (config && config.fallbackStrategy === 'REJECT_ALL') {
        this.logger.warn(
          '[Signer Router]  三方外部签名服务处于停用状态，当前容灾策略为严格熔断阻断 (REJECT_ALL)，已阻断出金交易加签',
        );
        throw new BadRequestException(
          '三方加密签名服务当前处于停用/维护状态，系统已启动严格安全熔断策略 (REJECT_ALL)，已拦截本次出金提现签名',
        );
      }

      this.logger.log(
        '[Signer Router]  三方外部签名服务处于停用状态，容灾策略为本地降级 (LOCAL_BACKUP)，转由本地备份私钥加签',
      );
    }

    if (wallet?.providerType && this.providers.has(wallet.providerType)) {
      return this.providers.get(wallet.providerType)!;
    }

    return this.localProvider;
  }

  async signEvmTransaction(request: EvmSignRequest): Promise<Hex> {
    const provider = this.resolveEffectiveProvider(request.wallet);
    return provider.signEvmTransaction(request);
  }

  async signSolanaTransaction(request: SolanaSignRequest): Promise<Transaction> {
    const provider = this.resolveEffectiveProvider(request.wallet);
    return provider.signSolanaTransaction(request);
  }

  async signTronTransaction(request: TronSignRequest): Promise<any> {
    const provider = this.resolveEffectiveProvider(request.wallet);
    return provider.signTronTransaction(request);
  }
}
