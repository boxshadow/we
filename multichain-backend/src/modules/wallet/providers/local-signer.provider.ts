import { Injectable, Logger } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair, Transaction } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import bs58 from 'bs58';
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

interface LocalWalletRecord {
  account: WalletAccount;
  privateKey: string;
}

@Injectable()
export class LocalSignerProvider implements ISignerProvider {
  readonly providerType: SignerProviderType = 'LOCAL';
  private readonly logger = new Logger(LocalSignerProvider.name);
  private records = new Map<string, LocalWalletRecord>();

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv() {
    // 1. EVM Separated Pools
    this.loadChainPool(ChainType.EVM, 'EVM_DEPOSIT_WALLET_KEYS', WalletPurpose.DEPOSIT);
    this.loadChainPool(ChainType.EVM, 'EVM_WITHDRAW_WALLET_KEYS', WalletPurpose.WITHDRAW);
    this.loadChainPool(ChainType.EVM, 'EVM_DEPLOYER_WALLET_KEYS', WalletPurpose.TOKEN_DEPLOY);

    // Fallback: legacy EVM_WALLET_KEYS or EVM_PRIVATE_KEY
    if (
      !process.env.EVM_DEPOSIT_WALLET_KEYS &&
      !process.env.EVM_WITHDRAW_WALLET_KEYS &&
      !process.env.EVM_DEPLOYER_WALLET_KEYS
    ) {
      const fallbackKeys = this.parseKeys(
        process.env.EVM_WALLET_KEYS || process.env.EVM_PRIVATE_KEY || '',
      );
      fallbackKeys.forEach((key, idx) => {
        const purpose =
          idx === 0 ? WalletPurpose.DEPOSIT : idx === 1 ? WalletPurpose.TOKEN_DEPLOY : WalletPurpose.WITHDRAW;
        this.addEvmKey(key, `evm-${purpose.toLowerCase()}-${idx}`, purpose);
      });
    }

    // 2. Solana Separated Pools
    this.loadChainPool(ChainType.SOLANA, 'SOLANA_DEPOSIT_WALLET_KEYS', WalletPurpose.DEPOSIT);
    this.loadChainPool(ChainType.SOLANA, 'SOLANA_WITHDRAW_WALLET_KEYS', WalletPurpose.WITHDRAW);
    this.loadChainPool(ChainType.SOLANA, 'SOLANA_DEPLOYER_WALLET_KEYS', WalletPurpose.TOKEN_DEPLOY);

    if (
      !process.env.SOLANA_DEPOSIT_WALLET_KEYS &&
      !process.env.SOLANA_WITHDRAW_WALLET_KEYS &&
      !process.env.SOLANA_DEPLOYER_WALLET_KEYS
    ) {
      const fallbackKeys = this.parseKeys(
        process.env.SOLANA_WALLET_KEYS || process.env.SOLANA_PRIVATE_KEY || '',
      );
      fallbackKeys.forEach((key, idx) => {
        const purpose =
          idx === 0 ? WalletPurpose.DEPOSIT : idx === 1 ? WalletPurpose.TOKEN_DEPLOY : WalletPurpose.WITHDRAW;
        this.addSolanaKey(key, `solana-${purpose.toLowerCase()}-${idx}`, purpose);
      });
    }

    // 3. Tron Separated Pools
    this.loadChainPool(ChainType.TRON, 'TRON_DEPOSIT_WALLET_KEYS', WalletPurpose.DEPOSIT);
    this.loadChainPool(ChainType.TRON, 'TRON_WITHDRAW_WALLET_KEYS', WalletPurpose.WITHDRAW);
    this.loadChainPool(ChainType.TRON, 'TRON_DEPLOYER_WALLET_KEYS', WalletPurpose.TOKEN_DEPLOY);

    if (
      !process.env.TRON_DEPOSIT_WALLET_KEYS &&
      !process.env.TRON_WITHDRAW_WALLET_KEYS &&
      !process.env.TRON_DEPLOYER_WALLET_KEYS
    ) {
      const fallbackKeys = this.parseKeys(
        process.env.TRON_WALLET_KEYS || process.env.TRON_PRIVATE_KEY || '',
      );
      fallbackKeys.forEach((key, idx) => {
        const purpose =
          idx === 0 ? WalletPurpose.DEPOSIT : idx === 1 ? WalletPurpose.TOKEN_DEPLOY : WalletPurpose.WITHDRAW;
        this.addTronKey(key, `tron-${purpose.toLowerCase()}-${idx}`, purpose);
      });
    }

    // Ensure all chains have minimum fallback wallets for development
    this.ensureMinimumWallets(ChainType.EVM);
    this.ensureMinimumWallets(ChainType.SOLANA);
    this.ensureMinimumWallets(ChainType.TRON);
  }

  private ensureMinimumWallets(chain: ChainType) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }
    const purposes = [WalletPurpose.DEPOSIT, WalletPurpose.WITHDRAW, WalletPurpose.TOKEN_DEPLOY];
    for (const purpose of purposes) {
      const hasWallet = Array.from(this.records.values()).some(
        (r) => r.account.chain === chain && r.account.purpose === purpose,
      );
      if (!hasWallet) {
        if (chain === ChainType.EVM) {
          const devKey =
            purpose === WalletPurpose.DEPOSIT
              ? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
              : purpose === WalletPurpose.WITHDRAW
                ? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
                : '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
          this.addEvmKey(devKey, `evm-${purpose.toLowerCase()}-dev`, purpose);
        } else if (chain === ChainType.SOLANA) {
          const seed = new Uint8Array(32);
          seed[0] = purpose === WalletPurpose.DEPOSIT ? 1 : purpose === WalletPurpose.WITHDRAW ? 2 : 3;
          const kp = Keypair.fromSeed(seed);
          this.addRecord(
            {
              id: `solana-${purpose.toLowerCase()}-dev`,
              chain: ChainType.SOLANA,
              address: kp.publicKey.toBase58(),
              providerType: 'LOCAL',
              purpose,
            },
            bs58.encode(kp.secretKey),
          );
        } else if (chain === ChainType.TRON) {
          const devKey =
            purpose === WalletPurpose.DEPOSIT
              ? 'da9426618c637374714cdd92829d940bfb1079fb5086ba9bad14656461a840e7'
              : purpose === WalletPurpose.WITHDRAW
                ? '855260f80749e10751306097731e3feac4477122509dc1ea4f2b89249e7086ff'
                : 'ea2468305f88469956cc658b975d4fa552b7b51b5894b967d6c6e73715b5f2a1';
          this.addTronKey(devKey, `tron-${purpose.toLowerCase()}-dev`, purpose);
        }
      }
    }
  }

  private loadChainPool(chain: ChainType, envVarName: string, purpose: WalletPurpose) {
    const raw = process.env[envVarName] || '';
    const keys = this.parseKeys(raw);
    keys.forEach((key, idx) => {
      const id = `${chain.toLowerCase()}-${purpose.toLowerCase()}-${idx}`;
      if (chain === ChainType.EVM) this.addEvmKey(key, id, purpose);
      else if (chain === ChainType.SOLANA) this.addSolanaKey(key, id, purpose);
      else if (chain === ChainType.TRON) this.addTronKey(key, id, purpose);
    });
  }

  private addEvmKey(rawKey: string, id: string, purpose: WalletPurpose) {
    try {
      const formattedKey: Hex = rawKey.startsWith('0x') ? (rawKey as Hex) : `0x${rawKey}`;
      const account = privateKeyToAccount(formattedKey);
      this.addRecord(
        {
          id,
          chain: ChainType.EVM,
          address: account.address,
          providerType: 'LOCAL',
          purpose,
        },
        formattedKey,
      );
    } catch (e: any) {
      this.logger.error(`Failed to parse local EVM key (${id}): ${e.message}`);
    }
  }

  private addSolanaKey(rawKey: string, id: string, purpose: WalletPurpose) {
    try {
      let keypair: Keypair;
      if (rawKey.trim().startsWith('[')) {
        keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey)));
      } else {
        keypair = Keypair.fromSecretKey(bs58.decode(rawKey.trim()));
      }
      this.addRecord(
        {
          id,
          chain: ChainType.SOLANA,
          address: keypair.publicKey.toBase58(),
          providerType: 'LOCAL',
          purpose,
        },
        rawKey.trim(),
      );
    } catch (e: any) {
      this.logger.error(`Failed to parse local Solana key (${id}): ${e.message}`);
    }
  }

  private addTronKey(rawKey: string, id: string, purpose: WalletPurpose) {
    try {
      const cleanKey = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey;
      const tw = new TronWeb({
        fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
        privateKey: cleanKey,
      });
      const addr = tw.defaultAddress.base58;
      if (typeof addr === 'string') {
        this.addRecord(
          {
            id,
            chain: ChainType.TRON,
            address: addr,
            providerType: 'LOCAL',
            purpose,
          },
          cleanKey,
        );
      }
    } catch (e: any) {
      this.logger.error(`Failed to parse local Tron key (${id}): ${e.message}`);
    }
  }

  private parseKeys(raw: string): string[] {
    if (!raw || raw.trim().length === 0) return [];
    if (raw.trim().startsWith('[') && raw.trim().endsWith(']') && !raw.includes(',')) {
      return [raw.trim()];
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed;
    } catch {}
    return raw
      .split(/[,;\n]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  addRecord(account: WalletAccount, privateKey: string) {
    this.records.set(account.address.toLowerCase(), { account, privateKey });
    this.logger.log(
      `[LocalSigner] Registered wallet [${account.purpose}]: ${account.chain} ${account.address} (${account.id})`,
    );
  }

  async getWallets(chain: ChainType): Promise<WalletAccount[]> {
    return Array.from(this.records.values())
      .map((r) => r.account)
      .filter((a) => a.chain === chain);
  }

  async signEvmTransaction(request: EvmSignRequest): Promise<Hex> {
    const record = this.records.get(request.wallet.address.toLowerCase());
    if (!record) {
      throw new Error(`Wallet ${request.wallet.address} not found in LocalSignerProvider`);
    }
    const account = privateKeyToAccount(record.privateKey as Hex);
    return account.signTransaction({
      type: 'eip1559',
      to: request.to,
      value: request.value,
      data: request.data,
      nonce: request.nonce,
      gas: request.gas,
      maxFeePerGas: request.maxFeePerGas,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas,
      chainId: request.chainId ?? 1,
    });
  }

  async signSolanaTransaction(request: SolanaSignRequest): Promise<Transaction> {
    const record = this.records.get(request.wallet.address.toLowerCase());
    if (!record) {
      throw new Error(`Wallet ${request.wallet.address} not found in LocalSignerProvider`);
    }
    let keypair: Keypair;
    if (record.privateKey.startsWith('[')) {
      keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(record.privateKey)));
    } else {
      keypair = Keypair.fromSecretKey(bs58.decode(record.privateKey));
    }
    request.transaction.partialSign(keypair);
    return request.transaction;
  }

  async signTronTransaction(request: TronSignRequest): Promise<any> {
    const record = this.records.get(request.wallet.address.toLowerCase());
    if (!record) {
      throw new Error(`Wallet ${request.wallet.address} not found in LocalSignerProvider`);
    }
    const tw = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: record.privateKey,
    });
    return tw.trx.sign(request.transaction, record.privateKey);
  }
}
