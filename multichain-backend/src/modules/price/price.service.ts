import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { PriceResult } from '../../common/types/common.types.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../adapters/solana/solana.adapter.js';
import { TronAdapter } from '../adapters/tron/tron.adapter.js';
import { IPriceAdapter } from '../adapters/interfaces/price-adapter.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private priceCache = new Map<string, { price: PriceResult; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 3000; // 3 seconds fast cache

  constructor(
    private readonly evmAdapter: EvmAdapter,
    private readonly solanaAdapter: SolanaAdapter,
    private readonly tronAdapter: TronAdapter,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private resolveAdapter(chainOrNetwork: string | ChainType): {
    adapter: IPriceAdapter;
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

  async getPrice(
    chainOrNetwork: string | ChainType,
    tokenAddress: string,
    quoteTokenAddress?: string,
  ): Promise<PriceResult> {
    const { adapter, networkId, family } = this.resolveAdapter(chainOrNetwork);
    const cacheKey = `${networkId}:${tokenAddress}:${quoteTokenAddress || 'USD'}`;
    const cached = this.priceCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.price;
    }

    let result: PriceResult;
    if (family === ChainType.EVM) {
      result = await this.evmAdapter.getPrice(
        tokenAddress,
        quoteTokenAddress,
        networkId,
      );
    } else {
      result = await adapter.getPrice(tokenAddress, quoteTokenAddress);
    }

    this.priceCache.set(cacheKey, {
      price: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return result;
  }
}
