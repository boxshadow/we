import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import bs58 from 'bs58';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import type { Hex } from 'viem';

export interface HotWallet {
  address: string;
  privateKey: string;
  chain: ChainType;
}

@Injectable()
export class WalletPoolService implements OnModuleInit {
  private readonly logger = new Logger(WalletPoolService.name);
  private pool = new Map<ChainType, HotWallet[]>([
    [ChainType.EVM, []],
    [ChainType.SOLANA, []],
    [ChainType.TRON, []],
  ]);

  onModuleInit() {
    this.loadWalletsFromEnv();
  }

  /**
   * Load hot wallets from environment variables
   */
  private loadWalletsFromEnv() {
    // 1. EVM Wallets
    const evmKeys = this.parseKeys(
      process.env.EVM_WALLET_KEYS || process.env.EVM_PRIVATE_KEY || '',
    );
    for (const key of evmKeys) {
      try {
        const formattedKey: Hex = key.startsWith('0x') ? (key as Hex) : `0x${key}`;
        const account = privateKeyToAccount(formattedKey);
        this.addWalletToPool(ChainType.EVM, account.address, formattedKey);
      } catch (e: any) {
        this.logger.error(`Failed to parse EVM private key: ${e.message}`);
      }
    }

    // 2. Solana Wallets
    const solanaKeys = this.parseKeys(
      process.env.SOLANA_WALLET_KEYS || process.env.SOLANA_PRIVATE_KEY || '',
    );
    for (const key of solanaKeys) {
      try {
        let keypair: Keypair;
        if (key.trim().startsWith('[')) {
          const secret = Uint8Array.from(JSON.parse(key));
          keypair = Keypair.fromSecretKey(secret);
        } else {
          const secret = bs58.decode(key.trim());
          keypair = Keypair.fromSecretKey(secret);
        }
        this.addWalletToPool(ChainType.SOLANA, keypair.publicKey.toBase58(), key.trim());
      } catch (e: any) {
        this.logger.error(`Failed to parse Solana private key: ${e.message}`);
      }
    }

    // 3. Tron Wallets
    const tronKeys = this.parseKeys(
      process.env.TRON_WALLET_KEYS || process.env.TRON_PRIVATE_KEY || '',
    );
    for (const key of tronKeys) {
      try {
        const cleanKey = key.trim().startsWith('0x') ? key.trim().slice(2) : key.trim();
        const tw = new TronWeb({
          fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
          privateKey: cleanKey,
        });
        const addr = tw.defaultAddress.base58;
        if (typeof addr === 'string') {
          this.addWalletToPool(ChainType.TRON, addr, cleanKey);
        }
      } catch (e: any) {
        this.logger.error(`Failed to parse Tron private key: ${e.message}`);
      }
    }

    this.logger.log(
      `Hot Wallet Pool Initialized: EVM=${this.pool.get(ChainType.EVM)?.length || 0}, Solana=${this.pool.get(ChainType.SOLANA)?.length || 0}, Tron=${this.pool.get(ChainType.TRON)?.length || 0}`,
    );
  }

  private parseKeys(raw: string): string[] {
    if (!raw || raw.trim().length === 0) return [];
    if (raw.trim().startsWith('[') && raw.trim().endsWith(']') && !raw.includes(',')) {
      // Single JSON array key (e.g. solana secret key)
      return [raw.trim()];
    }
    // Check if it's a JSON array of string keys
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        return parsed;
      }
    } catch {
      // Not a JSON array, fall through
    }
    // Split by comma or semicolon
    return raw
      .split(/[,;\n]/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }

  private addWalletToPool(chain: ChainType, address: string, privateKey: string) {
    const wallets = this.pool.get(chain) || [];
    // Avoid duplicate address
    if (!wallets.some((w) => w.address.toLowerCase() === address.toLowerCase())) {
      wallets.push({ chain, address, privateKey });
      this.pool.set(chain, wallets);
      this.logger.log(`[${chain}] Added hot wallet: ${address}`);
    }
  }

  /**
   * Randomly select a wallet from the pool for the specified chain
   */
  getRandomWallet(chain: ChainType): HotWallet {
    const wallets = this.pool.get(chain) || [];
    if (wallets.length === 0) {
      throw new Error(`No hot wallets configured for chain: ${chain}`);
    }
    const randomIndex = Math.floor(Math.random() * wallets.length);
    return wallets[randomIndex];
  }

  /**
   * Get all active hot wallets for a chain
   */
  getWallets(chain: ChainType): HotWallet[] {
    return this.pool.get(chain) || [];
  }

  /**
   * Find a specific wallet by its address
   */
  getWalletByAddress(chain: ChainType, address: string): HotWallet | undefined {
    const wallets = this.pool.get(chain) || [];
    return wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * Dynamically register a new hot wallet into the pool at runtime
   */
  registerWallet(chain: ChainType, address: string, privateKey: string): HotWallet {
    this.addWalletToPool(chain, address, privateKey);
    return { chain, address, privateKey };
  }
}
