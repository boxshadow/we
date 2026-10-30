import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TronWeb } from 'tronweb';
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

const TRON_DEAD_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const TRC20_TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class TronAdapter
  implements ITransferAdapter, ITokenAdapter, IDexAdapter, ILockAdapter, IPriceAdapter
{
  private readonly logger = new Logger(TronAdapter.name);

  constructor(
    @Inject(forwardRef(() => WalletSignerManager))
    private readonly walletSignerManager: WalletSignerManager,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  private getTronWeb(): TronWeb {
    const network = this.networkRegistryService.getNetwork('tron');
    const apiKey = process.env.TRON_API_KEY;
    return new TronWeb({
      fullHost: network.httpRpc.primaryUrl,
      headers: apiKey
        ? { 'TRON-PRO-API-KEY': apiKey }
        : network.httpRpc.headers,
    });
  }

  // ==================== Transfer & Verification ====================

  async transfer(dto: TransferDto): Promise<TxResult> {
    try {
      const tronWeb = this.getTronWeb();
      const wallet =
        dto.signerWallet || (await this.walletSignerManager.getRandomWallet(ChainType.TRON));

      let unsignedTx: any;

      if (!dto.tokenAddress) {
        // Native TRX Transfer (6 decimals)
        const amountSun = Number(BigNumberUtil.toAtomicUnits(dto.amount, 6));
        unsignedTx = await tronWeb.transactionBuilder.sendTrx(
          dto.to,
          amountSun,
          wallet.address,
        );
      } else {
        // TRC20 Token Transfer
        const contract = await tronWeb.contract().at(dto.tokenAddress);
        const decimals = (await contract.decimals().call()) || 6;
        const atomicAmount = BigNumberUtil.toAtomicUnits(dto.amount, Number(decimals));

        const triggerResult = await tronWeb.transactionBuilder.triggerSmartContract(
          dto.tokenAddress,
          'transfer(address,uint256)',
          { feeLimit: 150_000_000 },
          [
            { type: 'address', value: dto.to },
            { type: 'uint256', value: atomicAmount },
          ],
          wallet.address,
        );
        unsignedTx = triggerResult.transaction;
      }

      // Delegate Signing to SignerManager (Supports Local, DB, or Remote KMS/MPC without private key)
      const signedTx = await this.walletSignerManager.signTronTransaction({
        wallet,
        transaction: unsignedTx,
      });

      const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTx);

      if (!broadcastResult.result) {
        throw new Error(
          `Tron broadcast failed: ${broadcastResult.message || JSON.stringify(broadcastResult)}`,
        );
      }

      const txHash = broadcastResult.txid;
      this.logger.log(
        `Tron Transfer broadcasted [Wallet: ${wallet.address}, Provider: ${wallet.providerType}]: ${txHash}`,
      );
      return { success: true, txHash };
    } catch (err: any) {
      this.logger.error(`Tron transfer failed: ${err.message}`);
      return { success: false, txHash: '', error: err.message };
    }
  }

  async verifyTx(txHash: string): Promise<VerifyTxResult> {
    try {
      const tronWeb = this.getTronWeb();
      const [info, tx] = await Promise.all([
        tronWeb.trx.getTransactionInfo(txHash),
        tronWeb.trx.getTransaction(txHash),
      ]);

      if (!info || Object.keys(info).length === 0) {
        return { confirmed: false, status: TxStatus.PENDING };
      }

      if (info.receipt && info.receipt.result !== 'SUCCESS') {
        return {
          confirmed: false,
          blockNumber: info.blockNumber,
          status: TxStatus.FAILED,
          rawReceipt: info,
        };
      }

      let from: string | undefined;
      let to: string | undefined;
      let amount: string | undefined;
      let tokenAddress: string | undefined;

      const trc20Log = info.log?.find(
        (l: any) => l.topics && l.topics[0] === TRC20_TRANSFER_TOPIC,
      );

      if (trc20Log && trc20Log.topics.length >= 3) {
        const hexFrom = '41' + trc20Log.topics[1].slice(24);
        const hexTo = '41' + trc20Log.topics[2].slice(24);
        from = tronWeb.address.fromHex(hexFrom);
        to = tronWeb.address.fromHex(hexTo);
        tokenAddress = tronWeb.address.fromHex('41' + trc20Log.address);

        const contract = await tronWeb.contract().at(tokenAddress);
        const decimals = (await contract.decimals().call()) || 6;
        const rawAmount = BigInt('0x' + trc20Log.data);
        amount = BigNumberUtil.fromAtomicUnits(rawAmount, Number(decimals));
      } else if (tx?.raw_data?.contract?.[0]) {
        const contractParam = tx.raw_data.contract[0].parameter.value as any;
        if (contractParam.owner_address) {
          from = tronWeb.address.fromHex(contractParam.owner_address);
        }
        if (contractParam.to_address) {
          to = tronWeb.address.fromHex(contractParam.to_address);
        }
        if (contractParam.amount !== undefined) {
          amount = BigNumberUtil.fromAtomicUnits(contractParam.amount, 6);
        }
      }

      return {
        confirmed: true,
        blockNumber: info.blockNumber,
        status: TxStatus.CONFIRMED,
        from,
        to,
        amount,
        tokenAddress,
        rawReceipt: info,
      };
    } catch {
      return { confirmed: false, status: TxStatus.PENDING };
    }
  }

  async getBalance(address: string, tokenAddress?: string): Promise<string> {
    const tronWeb = this.getTronWeb();
    if (!tokenAddress || tokenAddress.trim().length === 0) {
      const sun = await tronWeb.trx.getBalance(address);
      return BigNumberUtil.fromAtomicUnits(sun, 6);
    } else {
      const contract = await tronWeb.contract().at(tokenAddress);
      const decimals = (await contract.decimals().call()) || 6;
      const rawBalance = await contract.balanceOf(address).call();
      return BigNumberUtil.fromAtomicUnits(rawBalance.toString(), Number(decimals));
    }
  }

  // ==================== Token Deployment ====================

  async deployToken(dto: TokenDeployDto): Promise<{ txResult: TxResult; tokenAddress: string }> {
    return {
      txResult: { success: true, txHash: 'simulated_tron_deploy_tx' },
      tokenAddress: 'T' + '0'.repeat(33),
    };
  }

  // ==================== DEX Liquidity & Trading ====================

  async addLiquidity(dto: AddLiquidityDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_sunswap_add_lp_tx' };
  }

  async removeLiquidity(dto: RemoveLiquidityDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_sunswap_remove_lp_tx' };
  }

  async swap(dto: SwapDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_sunswap_swap_tx' };
  }

  // ==================== Lock & Unlock ====================

  async lockToken(dto: LockDto): Promise<TxResult> {
    return { success: true, txHash: 'simulated_tron_lock_tx' };
  }

  async unlockToken(dto: UnlockDto): Promise<TxResult> {
    this.logger.log(
      `Unlocking ${dto.amount} TRC20 tokens (${dto.tokenAddress}, LockId: ${dto.lockId}) on Tron for recipient: ${dto.recipient}`,
    );
    return { success: true, txHash: 'simulated_tron_unlock_tx' };
  }

  // ==================== Price ====================

  async getPrice(tokenAddress: string, quoteTokenAddress?: string): Promise<PriceResult> {
    return {
      tokenAddress,
      priceUsd: 1.0,
      timestamp: Date.now(),
    };
  }
}
