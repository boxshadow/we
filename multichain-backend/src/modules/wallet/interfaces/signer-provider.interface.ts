import { ChainType } from '../../../common/enums/chain-type.enum.js';
import { WalletAccount, SignerProviderType } from './wallet-account.interface.js';
import type { Hex } from 'viem';
import type { Transaction } from '@solana/web3.js';

export interface EvmSignRequest {
  wallet: WalletAccount;
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  nonce?: number;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  chainId?: number;
}

export interface SolanaSignRequest {
  wallet: WalletAccount;
  transaction: Transaction;
}

export interface TronSignRequest {
  wallet: WalletAccount;
  transaction: any;
}

export interface ISignerProvider {
  readonly providerType: SignerProviderType;

  getWallets(chain: ChainType): Promise<WalletAccount[]>;
  signEvmTransaction(request: EvmSignRequest): Promise<Hex>;
  signSolanaTransaction(request: SolanaSignRequest): Promise<Transaction>;
  signTronTransaction(request: TronSignRequest): Promise<any>;
}
