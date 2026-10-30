import { Injectable, BadRequestException } from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { TransferDto, TxResult, VerifyTxResult } from '../../common/types/common.types.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';
import { SolanaAdapter } from '../adapters/solana/solana.adapter.js';
import { TronAdapter } from '../adapters/tron/tron.adapter.js';
import { ITransferAdapter } from '../adapters/interfaces/transfer-adapter.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

@Injectable()
export class TransferService {
  constructor(
    private readonly evmAdapter: EvmAdapter,
    private readonly solanaAdapter: SolanaAdapter,
    private readonly tronAdapter: TronAdapter,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private resolveAdapter(chainOrNetwork: string | ChainType): {
    adapter: ITransferAdapter;
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

  async transfer(chainOrNetwork: string | ChainType, dto: TransferDto): Promise<TxResult> {
    const { adapter, networkId } = this.resolveAdapter(chainOrNetwork);
    dto.networkId = dto.networkId || networkId;
    return adapter.transfer(dto);
  }

  async verifyTx(chainOrNetwork: string | ChainType, txHash: string): Promise<VerifyTxResult> {
    const { adapter, networkId, family } = this.resolveAdapter(chainOrNetwork);
    if (family === ChainType.EVM) {
      return this.evmAdapter.verifyTx(txHash, networkId);
    }
    return adapter.verifyTx(txHash);
  }

  async getBalance(
    chainOrNetwork: string | ChainType,
    address: string,
    tokenAddress?: string,
  ): Promise<string> {
    const { adapter, networkId, family } = this.resolveAdapter(chainOrNetwork);
    if (family === ChainType.EVM) {
      return this.evmAdapter.getBalance(address, tokenAddress, networkId);
    }
    return adapter.getBalance(address, tokenAddress);
  }

  /**
   * 方案 C: 获取链上出资地址当前最新确认 Nonce，用于在途对账挽救
   */
  async getNonce(chainOrNetwork: string | ChainType, address: string): Promise<number> {
    const { networkId, family } = this.resolveAdapter(chainOrNetwork);
    if (family === ChainType.EVM) {
      return this.evmAdapter.getNonce(address, networkId);
    }
    return 0;
  }
}
