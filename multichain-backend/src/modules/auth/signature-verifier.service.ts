import { Injectable, Logger } from '@nestjs/common';
import { verifyMessage, type Address, type Hex } from 'viem';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { TronWeb } from 'tronweb';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { EvmAdapter } from '../adapters/evm/evm.adapter.js';

@Injectable()
export class SignatureVerifierService {
  private readonly logger = new Logger(SignatureVerifierService.name);
  private tronWeb: TronWeb;

  constructor(private readonly evmAdapter: EvmAdapter) {
    this.tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      headers: process.env.TRON_API_KEY
        ? { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY }
        : undefined,
    });
  }

  /**
   * Unified Multi-Chain Signature Verification Entrypoint
   */
  async verifySignature(
    chain: ChainType,
    address: string,
    message: string,
    signature: string,
    networkId?: string,
  ): Promise<boolean> {
    try {
      switch (chain) {
        case ChainType.EVM:
          return await this.verifyEvm(address, message, signature, networkId);
        case ChainType.SOLANA:
          return await this.verifySolana(address, message, signature);
        case ChainType.TRON:
          return await this.verifyTron(address, message, signature);
        default:
          this.logger.warn(`Unsupported chain for signature verification: ${chain}`);
          return false;
      }
    } catch (err: any) {
      this.logger.error(
        `Signature verification exception [${chain}] for ${address}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * EVM Verification
   * Supports both Standard EOA (ecRecover) and EIP-1271 Smart Contract Wallets (Gnosis Safe, Argent, AA 4337)
   */
  async verifyEvm(
    address: string,
    message: string,
    signature: string,
    networkId: string = 'ethereum',
  ): Promise<boolean> {
    const formattedAddress = (
      address.startsWith('0x') ? address : `0x${address}`
    ) as Address;
    const formattedSig = (
      signature.startsWith('0x') ? signature : `0x${signature}`
    ) as Hex;

    // 1. Try On-chain Verification (PublicClient.verifyMessage handles both EOA & EIP-1271 on-chain!)
    try {
      const publicClient = this.evmAdapter.getPublicClient(networkId);
      const onChainValid = await publicClient.verifyMessage({
        address: formattedAddress,
        message,
        signature: formattedSig,
      });
      if (onChainValid) {
        return true;
      }
    } catch (err: any) {
      this.logger.debug(
        `On-chain EIP-1271 check skipped or failed on [${networkId}]: ${err.message}`,
      );
    }

    // 2. Fallback to Local Offline EOA Verification
    try {
      return await verifyMessage({
        address: formattedAddress,
        message,
        signature: formattedSig,
      });
    } catch (err: any) {
      this.logger.warn(`Local EVM ecRecover failed for ${address}: ${err.message}`);
      return false;
    }
  }

  /**
   * Solana Ed25519 Signature Verification
   */
  async verifySolana(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const messageBytes = new TextEncoder().encode(message);
      const pubkeyBytes = bs58.decode(address.trim());

      let sigBytes: Uint8Array;
      const cleanSig = signature.trim();
      if (cleanSig.startsWith('0x')) {
        sigBytes = Buffer.from(cleanSig.slice(2), 'hex');
      } else {
        try {
          sigBytes = bs58.decode(cleanSig);
        } catch {
          sigBytes = Buffer.from(cleanSig, 'base64');
        }
      }

      if (sigBytes.length !== 64) {
        this.logger.warn(`Invalid Solana signature length: ${sigBytes.length} (expected 64)`);
        return false;
      }

      return nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
    } catch (err: any) {
      this.logger.warn(`Solana signature verify error: ${err.message}`);
      return false;
    }
  }

  /**
   * Tron Signature Verification
   */
  async verifyTron(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const cleanAddress = address.trim();
      const cleanSig = signature.trim();

      const isHex = (str: string) =>
        typeof str === 'string' && /^(0x)?[0-9a-f]+$/i.test(str) && str.length % 2 === 0;

      const hexMessage = isHex(message) ? message : this.tronWeb.toHex(message);

      // 1. Primary verification: TronWeb verifyMessage with hex message (Standard TronLink sign format)
      try {
        const isValid = await this.tronWeb.trx.verifyMessage(
          hexMessage,
          cleanSig,
          cleanAddress,
        );
        if (isValid) {
          return true;
        }
      } catch (err: any) {
        this.logger.debug(`verifyMessage (hex) failed: ${err.message}`);
      }

      // 2. Fallback without Tron header
      try {
        const isValid = await this.tronWeb.trx.verifyMessage(
          hexMessage,
          cleanSig,
          cleanAddress,
          false,
        );
        if (isValid) {
          return true;
        }
      } catch {}

      // 3. Fallback: verifyMessageV2 (recovers base58 address)
      try {
        const recovered = await this.tronWeb.trx.verifyMessageV2(message, cleanSig);
        if (recovered && recovered.toLowerCase() === cleanAddress.toLowerCase()) {
          return true;
        }
      } catch {}

      try {
        const recovered = await this.tronWeb.trx.verifyMessageV2(hexMessage, cleanSig);
        if (recovered && recovered.toLowerCase() === cleanAddress.toLowerCase()) {
          return true;
        }
      } catch {}

      return false;
    } catch (err: any) {
      this.logger.warn(`Tron signature verify error: ${err.message}`);
      return false;
    }
  }
}
