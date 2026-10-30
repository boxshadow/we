import { Module } from '@nestjs/common';
import { EvmAdapter } from './evm/evm.adapter.js';
import { SolanaAdapter } from './solana/solana.adapter.js';
import { TronAdapter } from './tron/tron.adapter.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { NetworkModule } from '../network/network.module.js';

@Module({
  imports: [WalletModule, NetworkModule],
  providers: [EvmAdapter, SolanaAdapter, TronAdapter],
  exports: [EvmAdapter, SolanaAdapter, TronAdapter],
})
export class AdaptersModule {}
