import { Injectable, BadRequestException } from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import {
  AddLiquidityDto,
  RemoveLiquidityDto,
  SwapDto,
  TxResult,
} from '../../common/types/common.types.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../adapters/solana/solana.adapter.js';
import { TronAdapter } from '../adapters/tron/tron.adapter.js';
import { IDexAdapter } from '../adapters/interfaces/dex-adapter.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

@Injectable()
export class DexService {
  constructor(
    private readonly evmAdapter: EvmAdapter,
    private readonly solanaAdapter: SolanaAdapter,
    private readonly tronAdapter: TronAdapter,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private resolveAdapter(chainOrNetwork: string | ChainType): {
    adapter: IDexAdapter;
    networkId: string;
  } {
    const net = this.networkRegistryService.getNetwork(chainOrNetwork);
    if (net.security.isPaused) {
      throw new BadRequestException(
        `Network "${net.name}" (${net.networkId}) is currently paused for maintenance.`,
      );
    }

    switch (net.family) {
      case ChainType.EVM:
        return { adapter: this.evmAdapter, networkId: net.networkId };
      case ChainType.SOLANA:
        return { adapter: this.solanaAdapter, networkId: net.networkId };
      case ChainType.TRON:
        return { adapter: this.tronAdapter, networkId: net.networkId };
      default:
        throw new BadRequestException(`Unsupported chain family: ${net.family}`);
    }
  }

  async addLiquidity(
    chainOrNetwork: string | ChainType,
    dto: AddLiquidityDto,
  ): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(chainOrNetwork);
    dto.networkId = dto.networkId || networkId;
    return adapter.addLiquidity(dto);
  }

  async removeLiquidity(
    chainOrNetwork: string | ChainType,
    dto: RemoveLiquidityDto,
  ): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(chainOrNetwork);
    dto.networkId = dto.networkId || networkId;
    return adapter.removeLiquidity(dto);
  }

  async swap(
    chainOrNetwork: string | ChainType,
    dto: SwapDto,
  ): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(chainOrNetwork);
    dto.networkId = dto.networkId || networkId;
    return adapter.swap(dto);
  }
}
