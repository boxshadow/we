import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import {
  TxResult,
  VerifyTxResult,
  TransferDto,
  TokenDeployDto,
  AddLiquidityDto,
  RemoveLiquidityDto,
  SwapDto,
  LockDto,
  UnlockDto,
  PriceResult,
} from '../../../common/types/common.types.js';
import { TxStatus } from '../../../common/enums/tx-status.enum.js';
import { BigNumberUtil } from '../../../common/utils/bignumber.util.js';
import { ITransferAdapter } from '../interfaces/transfer-adapter.interface.js';
import { ITokenAdapter } from '../interfaces/token-adapter.interface.js';
import { IDexAdapter } from '../interfaces/dex-adapter.interface.js';
import { ILockAdapter } from '../interfaces/lock-adapter.interface.js';
import { IPriceAdapter } from '../interfaces/price-adapter.interface.js';
import { WalletSignerManager } from '../../wallet/wallet-signer.manager.js';
import { NetworkRegistryService } from '../../network/network-registry.service.js';
import { ChainType } from '../../../common/enums/chain-type.enum.js';

@Injectable()
export class SolanaAdapter
  implements ITransferAdapter, ITokenAdapter, IDexAdapter, ILockAdapter, IPriceAdapter
{
  private readonly logger = new Logger(SolanaAdapter.name);

  constructor(
    @Inject(forwardRef(() => WalletSignerManager))
    private readonly walletSignerManager: WalletSignerManager,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private getConnection(): Connection {
    const network = this.networkRegistryService.getNetwork('solana');
    return new Connection(network.httpRpc.primaryUrl, {
      commitment: 'confirmed',
      wsEndpoint: network.wsRpc.primaryUrl,
    });
  }

  // ==================== Transfer & Verification ====================

  async transfer(dto: TransferDto): Promise<TxResult> {
    try {
      const wallet =
        dto.signerWallet || (await this.walletSignerManager.getRandomWallet(ChainType.SOLANA));

      const senderPubkey = new PublicKey(wallet.address);
      const recipientPubkey = new PublicKey(dto.to);
      const tx = new Transaction();

      // Dynamic Priority Fee
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 10000,
        }),
      );

      if (!dto.tokenAddress) {
        // Native SOL Transfer (9 decimals)
        const lamports = Number(BigNumberUtil.toAtomicUnits(dto.amount, 9));
        tx.add(
          SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: recipientPubkey,
            lamports,
          }),
        );
      } else {
        // SPL Token Transfer
        const conn = this.getConnection();
        const mintPubkey = new PublicKey(dto.tokenAddress);
        const sourceAta = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
        const destAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

        // Check if destination ATA exists, create instruction if not
        const destAccountInfo = await conn.getAccountInfo(destAta);
        if (!destAccountInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              senderPubkey,
              destAta,
              recipientPubkey,
              mintPubkey,
            ),
          );
        }

        const mintInfo = await conn.getParsedAccountInfo(mintPubkey);
        const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;
        const atomicAmount = BigInt(BigNumberUtil.toAtomicUnits(dto.amount, decimals));

        tx.add(
          createTransferInstruction(
            sourceAta,
            destAta,
            senderPubkey,
            atomicAmount,
          ),
        );
      }

      const conn = this.getConnection();
      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = senderPubkey;

      // Delegate signing (Local, DB, or Remote KMS/MPC without exposing private key)
      const signedTx = await this.walletSignerManager.signSolanaTransaction({
        wallet,
        transaction: tx,
      });

      const txHash = await conn.sendRawTransaction(signedTx.serialize());
      this.logger.log(
        `Solana Transfer broadcasted [Wallet: ${wallet.address}, Provider: ${wallet.providerType}]: ${txHash}`,
      );
      return { success: true, txHash };
    } catch (err: any) {
      this.logger.error(`Solana transfer failed: ${err.message}`);
      return { success: false, txHash: '', error: err.message };
    }
  }

  async verifyTx(txHash: string): Promise<VerifyTxResult> {
    try {
      const conn = this.getConnection();
      const parsed = await conn.getParsedTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      if (!parsed) {
        return { confirmed: false, status: TxStatus.PENDING };
      }

      if (parsed.meta?.err) {
        return {
          confirmed: false,
          status: TxStatus.FAILED,
          rawReceipt: parsed,
        };
      }

      const instructions = parsed.transaction.message.instructions;
      let from: string | undefined;
      let to: string | undefined;
      let amount: string | undefined;
      let tokenAddress: string | undefined;

      for (const ix of instructions) {
        const parsedIx = (ix as any).parsed;
        if (parsedIx && parsedIx.type === 'transfer') {
          const info = parsedIx.info;
          from = info.source;
          to = info.destination;
          amount = BigNumberUtil.fromAtomicUnits(info.lamports, 9);
          break;
        } else if (parsedIx && (parsedIx.type === 'transferChecked' || parsedIx.type === 'transfer')) {
          const info = parsedIx.info;
          from = info.authority || info.source;
          to = info.destination;
          tokenAddress = info.mint;
          if (info.tokenAmount) {
            amount = info.tokenAmount.uiAmountString;
          } else if (info.amount) {
            amount = info.amount;
          }
          break;
        }
      }

      return {
        confirmed: true,
        blockNumber: parsed.slot,
        status: TxStatus.CONFIRMED,
        from,
        to,
        amount,
        tokenAddress,
        rawReceipt: parsed,
      };
    } catch {
      return { confirmed: false, status: TxStatus.PENDING };
    }
  }

  async getBalance(address: string, tokenAddress?: string): Promise<string> {
    const conn = this.getConnection();
    const pubkey = new PublicKey(address);

    if (!tokenAddress) {
      const lamports = await conn.getBalance(pubkey);
      return BigNumberUtil.fromAtomicUnits(lamports, 9);
    } else {
      const mintPubkey = new PublicKey(tokenAddress);
      const accounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
        mint: mintPubkey,
      });

      if (!accounts.value.length) {
        return '0';
      }

      return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString || '0';
    }
  }

  // ==================== Token Deployment ====================

  async deployToken(dto: TokenDeployDto): Promise<{ txResult: TxResult; tokenAddress: string }> {
    return {
      txResult: { success: true, txHash: 'simulated_solana_deploy' },
      tokenAddress: 'simulated_mint_address',
    };
  }

  // ==================== DEX Liquidity & Trading ====================

  async addLiquidity(dto: AddLiquidityDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_solana_add_lp_tx' };
  }

  async removeLiquidity(dto: RemoveLiquidityDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_solana_remove_lp_tx' };
  }

  async swap(dto: SwapDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_solana_swap_tx' };
  }

  // ==================== Lock & Unlock ====================

  async lockToken(dto: LockDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_solana_lock_tx' };
  }

  async unlockToken(dto: UnlockDto): Promise<TxResult> {
    this.logger.log(
      `Unlocking ${dto.amount} tokens (${dto.tokenAddress}, LockId: ${dto.lockId}) on Solana for recipient: ${dto.recipient}`,
    );
    return { success: true, txHash: 'simulated_solana_unlock_tx' };
  }

  // ==================== Price ====================

  async getPrice(tokenAddress: string, quoteTokenAddress?: string): Promise<PriceResult> {
    try {
      const res = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddress}`);
      if (res.ok) {
        const data = (await res.json()) as any;
        const price = Number(data?.data?.[tokenAddress]?.price || 0);
        return {
          tokenAddress,
          priceUsd: price,
          timestamp: Date.now(),
        };
      }
    } catch {}

    return {
      tokenAddress,
      priceUsd: 0,
      timestamp: Date.now(),
    };
  }
}
