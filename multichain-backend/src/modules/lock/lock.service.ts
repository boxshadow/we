import { Injectable, BadRequestException } from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { LockDto, UnlockDto, TxResult } from '../../common/types/common.types.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../adapters/solana/solana.adapter.js';
import { TronAdapter } from '../adapters/tron/tron.adapter.js';
import { ILockAdapter } from '../adapters/interfaces/lock-adapter.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

@Injectable()
export class LockService {
  constructor(
    private readonly evmAdapter: EvmAdapter,
    private readonly solanaAdapter: SolanaAdapter,
    private readonly tronAdapter: TronAdapter,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private resolveAdapter(networkOrChain: string | ChainType): {
    adapter: ILockAdapter;
    networkId: string;
  } {
    const net = this.networkRegistryService.getNetwork(networkOrChain);
    if (net.security.isPaused) {
      throw new BadRequestException(
        `Network "${net.name}" (${net.networkId}) is currently paused.`,
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
        throw new BadRequestException(
          `Unsupported chain family: ${net.family} for network ${net.networkId}`,
        );
    }
  }

  async lockToken(
    networkOrChain: string | ChainType,
    dto: LockDto,
  ): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(networkOrChain);
    dto.networkId = dto.networkId || networkId;
    return adapter.lockToken(dto);
  }

  async unlockToken(
    networkOrChain: string | ChainType,
    dto: UnlockDto,
  ): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(networkOrChain);
    dto.networkId = dto.networkId || networkId;
    return adapter.unlockToken(dto);
  }
}
