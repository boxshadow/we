import { Injectable, Logger } from '@nestjs/common';
import { ChainType } from '../../../common/enums/chain-type.enum.js';
import {
  ISignerProvider,
  EvmSignRequest,
  SolanaSignRequest,
  TronSignRequest,
} from '../interfaces/signer-provider.interface.js';
import {
  WalletAccount,
  SignerProviderType,
  WalletPurpose,
} from '../interfaces/wallet-account.interface.js';
import type { Hex } from 'viem';
import { Transaction } from '@solana/web3.js';

export interface EncryptedWalletEntity {
  id: string;
  chain: ChainType;
  address: string;
  purpose: WalletPurpose; // Explicitly marked as DEPOSIT or WITHDRAW in DB
  encryptedCiphertext: string;
  iv: string;
  tag: string;
}

@Injectable()
export class EncryptedDbSignerProvider implements ISignerProvider {
  readonly providerType: SignerProviderType = 'ENCRYPTED_DB';
  private readonly logger = new Logger(EncryptedDbSignerProvider.name);
  private dbWallets = new Map<string, EncryptedWalletEntity>();

  registerEncryptedWallet(entity: EncryptedWalletEntity) {
    this.dbWallets.set(entity.address.toLowerCase(), entity);
    this.logger.log(
      `[EncryptedDbSigner] Registered DB encrypted wallet [${entity.purpose}]: [${entity.chain}] ${entity.address}`,
    );
  }

  async getWallets(chain: ChainType): Promise<WalletAccount[]> {
    return Array.from(this.dbWallets.values())
      .filter((w) => w.chain === chain)
      .map((w) => ({
        id: w.id,
        chain: w.chain,
        address: w.address,
        providerType: 'ENCRYPTED_DB',
        purpose: w.purpose,
      }));
  }

  private async decryptKey(walletAddress: string): Promise<string> {
    const record = this.dbWallets.get(walletAddress.toLowerCase());
    if (!record) {
      throw new Error(`Wallet ${walletAddress} not found in EncryptedDbSignerProvider`);
    }
    return '0xsimulated_decrypted_key';
  }

  async signEvmTransaction(request: EvmSignRequest): Promise<Hex> {
    this.logger.log(`[EncryptedDbSigner] Decrypting and signing EVM tx for ${request.wallet.address}...`);
    return `0x02f8...simulated_signed_evm_tx` as Hex;
  }

  async signSolanaTransaction(request: SolanaSignRequest): Promise<Transaction> {
    this.logger.log(`[EncryptedDbSigner] Decrypting and signing Solana tx for ${request.wallet.address}...`);
    return request.transaction;
  }

  async signTronTransaction(request: TronSignRequest): Promise<any> {
    this.logger.log(`[EncryptedDbSigner] Decrypting and signing Tron tx for ${request.wallet.address}...`);
    return request.transaction;
  }
}
