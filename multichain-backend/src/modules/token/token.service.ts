import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { TokenDeployDto, TxResult } from '../../common/types/common.types.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../adapters/solana/solana.adapter.js';
import { TronAdapter } from '../adapters/tron/tron.adapter.js';
import { ITokenAdapter } from '../adapters/interfaces/token-adapter.interface.js';
import { WalletSignerManager } from '../wallet/wallet-signer.manager.js';
import { WalletPurpose } from '../wallet/interfaces/wallet-account.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly evmAdapter: EvmAdapter,
    private readonly solanaAdapter: SolanaAdapter,
    private readonly tronAdapter: TronAdapter,
    private readonly walletSignerManager: WalletSignerManager,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private resolveAdapter(chainOrNetwork: string | ChainType): {
    adapter: ITokenAdapter;
    networkId: string;
    family: ChainType;
  } {
    const net = this.networkRegistryService.getNetwork(chainOrNetwork);
    if (net.security.isPaused) {
      throw new BadRequestException(
        `Network "${net.name}" (${net.networkId}) is currently paused for maintenance.`,
      );
    }

    switch (net.family) {
      case ChainType.EVM:
        return {
          adapter: this.evmAdapter,
          networkId: net.networkId,
          family: ChainType.EVM,
        };
      case ChainType.SOLANA:
        return {
          adapter: this.solanaAdapter,
          networkId: net.networkId,
          family: ChainType.SOLANA,
        };
      case ChainType.TRON:
        return {
          adapter: this.tronAdapter,
          networkId: net.networkId,
          family: ChainType.TRON,
        };
      default:
        throw new BadRequestException(`Unsupported chain family: ${net.family}`);
    }
  }

  /**
   * 部署/发行代币 (Deploy Token)
   * 安全机制：自动从专属发币钱包池 (TOKEN_DEPLOY) 中选取部署者，严禁与高频出入金热钱包混用！
   */
  async deployToken(
    chainOrNetwork: string | ChainType,
    dto: TokenDeployDto,
  ): Promise<{ txResult: TxResult; tokenAddress: string }> {
    const { adapter, networkId, family } = this.resolveAdapter(chainOrNetwork);
    dto.networkId = dto.networkId || networkId;

    // 1. 获取专属发币钱包
    const deployerWallet =
      dto.signerWallet || (await this.walletSignerManager.getRandomDeployerWallet(family));

    // 2. 严格安全审计：发币人必须是 TOKEN_DEPLOY 专用钱包
    if (deployerWallet.purpose !== WalletPurpose.TOKEN_DEPLOY) {
      throw new BadRequestException(
        `[Security Violation] Wallet ${deployerWallet.address} is ${deployerWallet.purpose}, not a TOKEN_DEPLOY wallet!`,
      );
    }

    dto.signerWallet = deployerWallet;

    // 若未指定代币初始接收人，默认由发币部署者账户接收
    if (!dto.recipient) {
      dto.recipient = deployerWallet.address;
    }

    this.logger.log(
      `[Token Deployment] Initiating token issuance on [${networkId}]: ${dto.name} (${dto.symbol}), Deployer: ${deployerWallet.address} (Purpose: ${deployerWallet.purpose})`,
    );

    return adapter.deployToken(dto);
  }
}
