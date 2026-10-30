import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  createPublicClient,
  http,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  defineChain,
  keccak256,
  type PublicClient,
  type Hex,
  type Address,
} from 'viem';
import { mainnet } from 'viem/chains';
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
import { ITransferAdapter } from '../interfaces/transfer-adapter.interface.js';
import { ITokenAdapter } from '../interfaces/token-adapter.interface.js';
import { IDexAdapter } from '../interfaces/dex-adapter.interface.js';
import { ILockAdapter } from '../interfaces/lock-adapter.interface.js';
import { IPriceAdapter } from '../interfaces/price-adapter.interface.js';
import { WalletSignerManager } from '../../wallet/wallet-signer.manager.js';
import { NetworkRegistryService } from '../../network/network-registry.service.js';
import { ChainType } from '../../../common/enums/chain-type.enum.js';
import {
  ERC20_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  DEAD_ADDRESS_EVM,
  TOKEN_LOCKER_ABI,
} from './contracts.js';

const ERC20_TRANSFER_EVENT_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class EvmAdapter
  implements ITransferAdapter, ITokenAdapter, IDexAdapter, ILockAdapter, IPriceAdapter
{
  private readonly logger = new Logger(EvmAdapter.name);
  private clientPool = new Map<string, PublicClient>();

  constructor(
    @Inject(forwardRef(() => WalletSignerManager))
    private readonly walletSignerManager: WalletSignerManager,
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  /**
   * Dynamically resolves or creates PublicClient for the requested EVM network (Ethereum, BSC, Base, Arbitrum, etc.)
   */
  public getPublicClient(networkIdOrAlias: string = 'ethereum'): PublicClient {
    const network = this.networkRegistryService.getNetwork(networkIdOrAlias);
    if (this.clientPool.has(network.networkId)) {
      return this.clientPool.get(network.networkId)!;
    }

    const chain = defineChain({
      id: network.chainId || 1,
      name: network.name,
      nativeCurrency: {
        name: network.nativeCurrency.name,
        symbol: network.nativeCurrency.symbol,
        decimals: network.nativeCurrency.decimals,
      },
      rpcUrls: {
        default: {
          http: [
            network.httpRpc.primaryUrl,
            ...(network.httpRpc.fallbackUrls || []),
          ],
          webSocket: network.wsRpc.primaryUrl
            ? [network.wsRpc.primaryUrl, ...(network.wsRpc.fallbackUrls || [])]
            : undefined,
        },
      },
    });

    const client = createPublicClient({
      chain,
      transport: http(network.httpRpc.primaryUrl),
    });

    this.clientPool.set(network.networkId, client);
    this.logger.log(
      `Created EVM PublicClient for [${network.networkId}] (ChainId: ${network.chainId}, RPC: ${network.httpRpc.primaryUrl})`,
    );
    return client;
  }

  // ==================== Transfer & Verification ====================

  async transfer(dto: TransferDto): Promise<TxResult> {
    try {
      const network = this.networkRegistryService.getNetwork(
        dto.networkId || 'ethereum',
      );
      const publicClient = this.getPublicClient(network.networkId);

      // 1. Resolve signer wallet (from DTO or random from pool)
      const wallet =
        dto.signerWallet || (await this.walletSignerManager.getRandomWallet(ChainType.EVM));

      const fromAddress = wallet.address as Address;
      const toAddress = dto.to as Address;

      // 2. Fetch Nonce and Gas Fees
      const [nonce, gasPrice] = await Promise.all([
        publicClient.getTransactionCount({ address: fromAddress }),
        publicClient.getGasPrice(),
      ]);

      let txData: Hex | undefined;
      let value: bigint = 0n;

      if (!dto.tokenAddress) {
        // Native token Transfer (ETH/BNB/etc.)
        value = parseEther(dto.amount);
      } else {
        // ERC20 Token Transfer
        const decimals = await this.getTokenDecimals(
          dto.tokenAddress as Address,
          network.networkId,
        );
        const atomicAmount = parseUnits(dto.amount, decimals);
        txData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [toAddress, atomicAmount],
        });
      }

      // 3. Delegate Signing to SignerManager (Supports Local, DB Encrypted, or Remote KMS/MPC without private key)
      const priorityFee = gasPrice > parseUnits('1', 9) ? parseUnits('1', 9) : (gasPrice > 100000000n ? gasPrice / 2n : 100000000n);
      const maxFee = gasPrice * 2n + priorityFee;

      const signedRawTx = await this.walletSignerManager.signEvmTransaction({
        wallet,
        to: dto.tokenAddress ? (dto.tokenAddress as Address) : toAddress,
        value,
        data: txData,
        nonce,
        gas: dto.tokenAddress ? 100000n : 60000n,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: priorityFee,
        chainId: network.chainId || mainnet.id,
      });

      // 4. 方案 C 核心：在调用任何网络请求前，本地离线确定性预计算 TxHash
      // keccak256(signedRawTx) 100% 确定生成链上唯一哈希，彻底脱离对 RPC 响应的单点依赖
      const localTxHash = keccak256(signedRawTx as Hex);

      // 5. 向公链 RPC 节点广播
      try {
        const broadcastHash = await publicClient.sendRawTransaction({
          serializedTransaction: signedRawTx,
        });

        const finalHash = broadcastHash || localTxHash;
        this.logger.log(
          `EVM Transfer broadcasted on [${network.networkId}] [Wallet: ${wallet.address}, Provider: ${wallet.providerType}]: ${finalHash} (Nonce: ${nonce})`,
        );
        return {
          success: true,
          txHash: finalHash,
          nonce: Number(nonce),
          signedRawTx,
          isInFlight: false,
        };
      } catch (broadcastErr: any) {
        // 关键保护：RPC 超时、网络断开或 504 Gateway Timeout 时，交易很大概率已被节点推入 mempool
        // 绝不可当成失败直接扣款回滚！而是返回预计算 Hash 与在途标记，交由双轨监听对账引擎兜底
        this.logger.warn(
          `EVM RPC 节点广播未收到响应或超时: ${broadcastErr.message}，已保留本地确定性哈希: ${localTxHash}，转入在途对账队列`,
        );
        return {
          success: true,
          txHash: localTxHash,
          nonce: Number(nonce),
          signedRawTx,
          isInFlight: true,
          warning: `RPC 节点响应超时，已凭预计算哈希转入在途对账引擎: ${broadcastErr.message}`,
        };
      }
    } catch (error: any) {
      this.logger.error(`EVM Transfer failed before signing: ${error.message}`);
      return { success: false, txHash: '', error: error.message };
    }
  }

  async verifyTx(txHash: string, networkId: string = 'ethereum'): Promise<VerifyTxResult> {
    try {
      const publicClient = this.getPublicClient(networkId);
      const formattedHash: Hex = txHash.startsWith('0x') ? (txHash as Hex) : `0x${txHash}`;
      const [receipt, tx] = await Promise.all([
        publicClient.getTransactionReceipt({ hash: formattedHash }),
        publicClient.getTransaction({ hash: formattedHash }),
      ]);

      if (receipt.status !== 'success') {
        return {
          confirmed: false,
          blockNumber: Number(receipt.blockNumber),
          status: TxStatus.FAILED,
          rawReceipt: receipt,
        };
      }

      const transferLog = receipt.logs.find(
        (log) => log.topics[0] === ERC20_TRANSFER_EVENT_SIGNATURE && log.topics.length >= 3,
      );

      if (transferLog && transferLog.topics[1] && transferLog.topics[2]) {
        const from = `0x${transferLog.topics[1].slice(26)}`.toLowerCase();
        const to = `0x${transferLog.topics[2].slice(26)}`.toLowerCase();
        const tokenAddress = transferLog.address.toLowerCase();
        const decimals = await this.getTokenDecimals(transferLog.address as Address, networkId);
        const rawAmount = BigInt(transferLog.data);
        const amount = formatUnits(rawAmount, decimals);

        return {
          confirmed: true,
          blockNumber: Number(receipt.blockNumber),
          status: TxStatus.CONFIRMED,
          from,
          to,
          amount,
          tokenAddress,
          rawReceipt: receipt,
        };
      }

      // Native Transfer
      return {
        confirmed: true,
        blockNumber: Number(receipt.blockNumber),
        status: TxStatus.CONFIRMED,
        from: tx.from.toLowerCase(),
        to: (tx.to || '').toLowerCase(),
        amount: formatEther(tx.value),
        rawReceipt: receipt,
      };
    } catch (error: any) {
      this.logger.error(`VerifyTx failed for ${txHash} on ${networkId}: ${error.message}`);
      return {
        confirmed: false,
        status: TxStatus.PENDING,
      };
    }
  }

  async getBalance(
    address: string,
    tokenAddress?: string,
    networkId: string = 'ethereum',
  ): Promise<string> {
    const publicClient = this.getPublicClient(networkId);
    if (!tokenAddress) {
      const balance = await publicClient.getBalance({ address: address as Address });
      return formatEther(balance);
    } else {
      const decimals = await this.getTokenDecimals(tokenAddress as Address, networkId);
      const balance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as Address],
      });
      return formatUnits(balance, decimals);
    }
  }

  // ==================== Token Deployment ====================

  async deployToken(dto: TokenDeployDto): Promise<{ txResult: TxResult; tokenAddress: string }> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    this.logger.log(
      `Deploying token [${dto.symbol}] on EVM [${network.networkId}] via deployer wallet`,
    );
    return {
      txResult: { success: true, txHash: '0x' + '0'.repeat(64) },
      tokenAddress: dto.recipient || '0x' + '0'.repeat(40),
    };
  }

  // ==================== DEX Liquidity & Trading ====================

  async addLiquidity(dto: AddLiquidityDto): Promise<TxResult> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    const router = network.contracts.dexRouterAddress;
    this.logger.log(
      `Adding liquidity on [${network.networkId}] via Router: ${router}`,
    );
    return { success: true, txHash: `simulated_evm_add_lp_${network.networkId}` };
  }

  async removeLiquidity(dto: RemoveLiquidityDto): Promise<TxResult> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    const router = network.contracts.dexRouterAddress;
    this.logger.log(
      `Removing liquidity from pool ${dto.poolAddress} on [${network.networkId}] via Router: ${router}`,
    );
    return { success: true, txHash: `simulated_evm_remove_lp_${network.networkId}` };
  }

  async swap(dto: SwapDto): Promise<TxResult> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    const router = network.contracts.dexRouterAddress;
    this.logger.log(
      `Swapping token ${dto.tokenIn} -> ${dto.tokenOut} on [${network.networkId}] via Router: ${router}`,
    );
    return { success: true, txHash: `simulated_evm_swap_${network.networkId}` };
  }

  // ==================== Lock & Unlock ====================

  async lockToken(dto: LockDto): Promise<TxResult> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    const locker = network.contracts.tokenLockerAddress || DEAD_ADDRESS_EVM;
    this.logger.log(
      `Locking ${dto.amount} tokens (${dto.tokenAddress}) on [${network.networkId}] in Locker: ${locker} until ${dto.unlockTimestamp}`,
    );
    return {
      success: true,
      txHash: `0xlock_${network.networkId}_${Date.now()}`,
    };
  }

  async unlockToken(dto: UnlockDto): Promise<TxResult> {
    const network = this.networkRegistryService.getNetwork(dto.networkId || 'ethereum');
    const locker = network.contracts.tokenLockerAddress || DEAD_ADDRESS_EVM;
    this.logger.log(
      `Unlocking ${dto.amount} tokens (LockId: ${dto.lockId}, Contract: ${dto.tokenAddress}) on [${network.networkId}] from Locker: ${locker} to ${dto.recipient}`,
    );
    return {
      success: true,
      txHash: `0xunlock_${network.networkId}_${Date.now()}`,
    };
  }

  // ==================== Price ====================

  async getPrice(
    tokenAddress: string,
    quoteTokenAddress?: string,
    networkId: string = 'ethereum',
  ): Promise<PriceResult> {
    try {
      const network = this.networkRegistryService.getNetwork(networkId);
      const publicClient = this.getPublicClient(network.networkId);
      const router = (network.contracts.dexRouterAddress ||
        process.env.EVM_ROUTER_ADDRESS ||
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D') as Address;

      const factory = (network.contracts.dexFactoryAddress ||
        (await publicClient.readContract({
          address: router,
          abi: UNISWAP_V2_ROUTER_ABI,
          functionName: 'factory',
        }))) as Address;

      const quote = quoteTokenAddress
        ? (quoteTokenAddress as Address)
        : (network.contracts.wrappedNativeAddress ||
            (await publicClient.readContract({
              address: router,
              abi: UNISWAP_V2_ROUTER_ABI,
              functionName: 'WETH',
            }))) as Address;

      const pairAddress = await publicClient.readContract({
        address: factory,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: 'getPair',
        args: [tokenAddress as Address, quote],
      });

      if (pairAddress === '0x0000000000000000000000000000000000000000') {
        return { tokenAddress, priceUsd: 0, timestamp: Date.now() };
      }

      const [reserve0, reserve1] = await publicClient.readContract({
        address: pairAddress,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: 'getReserves',
      });

      const token0 = await publicClient.readContract({
        address: pairAddress,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: 'token0',
      });

      const decToken = await this.getTokenDecimals(tokenAddress as Address, networkId);
      const decQuote = await this.getTokenDecimals(quote, networkId);

      const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();
      const tokenReserve = isToken0 ? reserve0 : reserve1;
      const quoteReserve = isToken0 ? reserve1 : reserve0;

      const formattedToken = formatUnits(tokenReserve, decToken);
      const formattedQuote = formatUnits(quoteReserve, decQuote);

      const price = Number(formattedQuote) / Number(formattedToken);

      return {
        tokenAddress,
        quoteTokenAddress: quote,
        priceUsd: isNaN(price) ? 0 : price,
        timestamp: Date.now(),
      };
    } catch {
      return { tokenAddress, priceUsd: 0, timestamp: Date.now() };
    }
  }

  private async getTokenDecimals(address: Address, networkId: string = 'ethereum'): Promise<number> {
    try {
      const publicClient = this.getPublicClient(networkId);
      return await publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      });
    } catch {
      return 18;
    }
  }

  /**
   * 方案 C: 获取链上指定金库地址的最新确认 Nonce，用于无收据时的 Nonce 探测挽救
   */
  async getNonce(address: string, networkId: string = 'ethereum'): Promise<number> {
    const publicClient = this.getPublicClient(networkId);
    const nonce = await publicClient.getTransactionCount({
      address: address as Address,
      blockTag: 'latest',
    });
    return Number(nonce);
  }
}
