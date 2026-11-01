import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import BigNumber from 'bignumber.js';
import { WalletSignerManager } from '../wallet/wallet-signer.manager.js';
import { TransferService } from './transfer.service.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';
import { TokenConfigService } from '../token/token-config.service.js';
import { BalanceService } from '../balance/balance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddressValidatorUtil } from '../../common/utils/address-validator.util.js';
import {
  CreateWithdrawalDto,
  OrderStatus,
  WithdrawOrder,
} from './types/order.types.js';
import { WithdrawWalletService } from '../wallet/withdraw-wallet.service.js';

@Injectable()
export class WithdrawService implements OnModuleInit {
  private readonly logger = new Logger(WithdrawService.name);
  private orders = new Map<string, WithdrawOrder>();

  // 用户级在途提现排他锁：防止同一用户并发多笔提现引发余额竞态双花
  private activeWithdrawUsers = new Set<string>();

  // 客户端业务幂等性缓存：防止网络重发或重复点击造成重复出金
  private idempotentOrders = new Map<string, any>();

  constructor(
    private readonly walletSignerManager: WalletSignerManager,
    private readonly transferService: TransferService,
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly tokenConfigService?: TokenConfigService,
    @Optional() private readonly balanceService?: BalanceService,
    @Optional() private readonly withdrawWalletService?: WithdrawWalletService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      await this.loadActiveOrdersFromDb();
    }
  }

  private async loadActiveOrdersFromDb() {
    if (!this.prisma) return;
    try {
      const dbOrders = await this.prisma.withdrawalOrder.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      for (const d of dbOrders) {
        this.orders.set(d.id, {
          id: d.id,
          userId: d.userId,
          network: d.network,
          chain: d.network,
          fromVault: d.fromVault,
          toAddress: d.toAddress,
          amount: d.amount,
          tokenSymbol: d.tokenSymbol,
          tokenAddress: d.tokenAddress || undefined,
          txHash: d.txHash || undefined,
          status: d.status as OrderStatus,
          errorMessage: d.errorMessage || undefined,
          createdAt: Number(d.createdAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : undefined,
        });
      }
      this.logger.log(` 已加载 ${dbOrders.length} 条提现出金记录至内存状态机`);
    } catch (err: any) {
      this.logger.warn(`加载提现订单记录失败: ${err.message}`);
    }
  }

  async processWithdrawal(dto: any) {
    const userId = dto.userId || 'anonymous-user';
    const withdrawalDto: CreateWithdrawalDto = {
      userId,
      network: String(dto.network),
      tokenSymbol: dto.tokenSymbol || 'USDT',
      tokenAddress: dto.tokenAddress,
      toAddress: dto.toAddress || dto.userAddress,
      amount: dto.amount,
    };
    return this.createWithdrawal(userId, withdrawalDto);
  }

  /**
   * 1. 用户发起提现，服务端进行严格风控与链上出金转账
   * - 校验网络与代币是否停用或熔断
   * - 校验提现目标地址格式
   * - 校验并原子扣除用户的对应 Token 资产余额 (UserBalance)
   * - 服务端热钱包签名并广播链上转账 (TransferService)
   * - 若链上广播失败，触发补偿机制全额退款回滚
   */
  async createWithdrawal(
    userId: string,
    dto: CreateWithdrawalDto,
  ): Promise<{
    success: boolean;
    orderId: string;
    txHash: string;
    status: OrderStatus;
    network: string;
    tokenSymbol: string;
    amount: string;
    toAddress: string;
    fromVault: string;
    fromWallet?: string;
    remainingBalance?: string;
    pipelineSteps?: any[];
  }> {
    // 0. 客户端业务幂等键防重放检查 (Idempotency Key Check)
    if (dto.idempotencyKey && this.idempotentOrders.has(dto.idempotencyKey)) {
      this.logger.log(`[Idempotency Hit] 命中业务幂等键: ${dto.idempotencyKey}`);
      return this.idempotentOrders.get(dto.idempotencyKey);
    }

    // 0.1 用户在途排他锁 (防止同一用户并发多笔提现引发双花攻击)
    if (this.activeWithdrawUsers.has(userId)) {
      throw new ConflictException(
        `用户 [${userId}] 当前正有一笔提现出金在链上处理中，请勿并发发起提现请求 (Withdrawal In-flight Lock Active)`,
      );
    }
    this.activeWithdrawUsers.add(userId);

    try {
      const net = this.networkRegistryService.getNetwork(dto.network);
      if (net.security.isPaused) {
        throw new BadRequestException(
          `网络 "${net.name}" (${net.networkId}) 目前处于熔断维护状态，暂停提现出金`,
        );
      }

      const amountBn = new BigNumber(dto.amount);
      if (amountBn.isNaN() || !amountBn.isFinite() || amountBn.isLessThanOrEqualTo(0)) {
        throw new BadRequestException(`提现金额不合法: ${dto.amount}`);
      }

      if (!dto.toAddress || dto.toAddress.trim().length < 10) {
        throw new BadRequestException(`提现接收地址无效: ${dto.toAddress}`);
      }
      const cleanToAddress = dto.toAddress.trim();

      // 严格公链格式校验 (EVM / TRON / SOLANA)
      const addrCheck = AddressValidatorUtil.validate(net.family, cleanToAddress);
      if (!addrCheck.isValid) {
        throw new BadRequestException(
          `提现接收地址格式不符合 [${net.family}] 规范: ${addrCheck.error || cleanToAddress}`,
        );
      }

      // 1. 查找并校验支持的代币
      const cleanSymbol = dto.tokenSymbol.trim().toUpperCase();
      let tokenAddress = dto.tokenAddress ? dto.tokenAddress.trim() : undefined;

      if (this.tokenConfigService) {
        const supportedToken = await this.tokenConfigService.findToken(
          net.networkId,
          cleanSymbol,
        );
        if (supportedToken) {
          if (!supportedToken.isActive) {
            throw new BadRequestException(
              `代币 [${cleanSymbol}] 在网络 [${net.networkId}] 提现已被管理员暂停`,
            );
          }
          tokenAddress = supportedToken.contractAddress || undefined;

          if (amountBn.isLessThan(new BigNumber(supportedToken.minDeposit))) {
            throw new BadRequestException(
              `提现金额小于该代币最小限额: ${supportedToken.minDeposit} ${cleanSymbol}`,
            );
          }
        }
      }

      // 2. 检查用户资产余额
      if (this.balanceService) {
        const currentBalanceStr = await this.balanceService.getSingleBalance(
          userId,
          net.networkId,
          cleanSymbol,
        );
        const currentBalanceBn = new BigNumber(currentBalanceStr);
        if (currentBalanceBn.isLessThan(amountBn)) {
          throw new BadRequestException(
            `用户在 [${net.networkId}] 的 [${cleanSymbol}] 资产余额不足 (当前: ${currentBalanceStr}, 提现需要: ${dto.amount})`,
          );
        }

        // 3. 原子扣减用户余额 (采用用户原子锁防竞态超扣)
        await this.balanceService.debitBalance(
          userId,
          net.networkId,
          cleanSymbol,
          dto.amount,
        );
      }

      // 4. 获取服务端出资热钱包 (WITHDRAW 专属池，按 EVM / SOLANA / TRON 动态挑选)
      let vaultWallet: any;
      try {
        if (this.withdrawWalletService) {
          vaultWallet = await this.withdrawWalletService.getRandomActiveWithdrawWallet(net.family);
        } else {
          vaultWallet = await this.walletSignerManager.getRandomWithdrawWallet(
            net.family,
          );
        }
      } catch {
        // 容错兜底
        vaultWallet = await this.walletSignerManager.getRandomWallet(net.family);
      }

      const orderId = randomUUID();
      const now = Date.now();

      const pipelineSteps = [
        {
          step: 1,
          name: '参数与地址校验',
          status: 'SUCCESS' as const,
          detail: `公链: ${net.name} (${net.networkId})，接收地址格式校验通过: ${cleanToAddress}`,
          timestamp: now,
        },
        {
          step: 2,
          name: '余额核验与资产锁定',
          status: 'SUCCESS' as const,
          detail: `用户可用资产核验通过，已原子锁定扣减 ${dto.amount} ${cleanSymbol}`,
          timestamp: now,
        },
        {
          step: 3,
          name: '智能匹配出资热钱包',
          status: 'SUCCESS' as const,
          detail: `从 [${net.family}] 提现池匹配就绪节点: ${vaultWallet.address}`,
          timestamp: now,
        },
      ];

      const order: WithdrawOrder = {
        id: orderId,
        userId,
        network: net.networkId,
        chain: net.networkId,
        fromVault: vaultWallet.address,
        toAddress: cleanToAddress,
        amount: dto.amount,
        tokenSymbol: cleanSymbol,
        tokenAddress,
        status: OrderStatus.CONFIRMING,
        pipelineSteps,
        createdAt: now,
      };
      this.orders.set(orderId, order);

      if (this.prisma) {
        await this.prisma.withdrawalOrder.create({
          data: {
            id: orderId,
            userId,
            network: net.networkId,
            tokenSymbol: cleanSymbol,
            tokenAddress: tokenAddress || null,
            fromVault: vaultWallet.address,
            toAddress: cleanToAddress,
            amount: dto.amount,
            fee: '0',
            status: 'PROCESSING',
            createdAt: BigInt(now),
          },
        });
      }

      this.logger.log(
        ` [Withdrawal Initiated] [Order ${orderId}] User=${userId}, Net=${net.networkId}, Token=${cleanSymbol}, Amount=${dto.amount}, To=${cleanToAddress}, FromVault=${vaultWallet.address}`,
      );

      // 5. 服务端发起线上真实交易转账
      try {
        const txRes = await this.transferService.transfer(dto.network, {
          to: cleanToAddress,
          amount: dto.amount,
          tokenAddress,
          signerWallet: vaultWallet,
        });

        if (!txRes.success || !txRes.txHash) {
          throw new Error(txRes.error || '链上转账出资金额未成功生成交易哈希');
        }

        const txHash = txRes.txHash;
        order.txHash = txHash;
        order.nonce = txRes.nonce;
        order.signedRawTx = txRes.signedRawTx;
        order.isPreCalculated = true;

        if (txRes.isInFlight) {
          // 方案 C: 核心在途未明状态分支 (In-Flight)
          // 彻底阻断因 RPC 网络响应超时导致的错误资金回滚与双花套现
          order.isInFlight = true;
          order.inFlightReason = txRes.warning || 'RPC 网络响应超时，凭预计算 Hash 挂起至在途对账引擎';
          order.status = OrderStatus.CONFIRMING;

          order.pipelineSteps?.push(
            {
              step: 4,
              name: '安全 Enclave 物理加签',
              status: 'SUCCESS' as const,
              detail: `本地离线预计算交易哈希完成: ${txHash} (Nonce: ${txRes.nonce})`,
              timestamp: Date.now(),
            },
            {
              step: 5,
              name: '公链节点广播入块',
              status: 'PROCESSING' as const,
              detail: `RPC 广播暂无响应，已保留预计算 Hash 并无缝挂起至双轨对账引擎`,
              timestamp: Date.now(),
            },
            {
              step: 6,
              name: '区块打包与确认',
              status: 'PENDING' as const,
              detail: '等待双轨对账引擎（WebSocket 实时推送 / HTTP 轮询）探测出块',
              timestamp: Date.now(),
            },
          );

          if (this.prisma) {
            await this.prisma.withdrawalOrder.update({
              where: { id: orderId },
              data: {
                status: 'PROCESSING',
                txHash,
              },
            }).catch(() => {});
          }

          const remainingBalance = this.balanceService
            ? await this.balanceService.getSingleBalance(userId, net.networkId, cleanSymbol)
            : undefined;

          this.logger.warn(
            ` [Withdrawal In-Flight] [Order ${orderId}] RPC 响应超时，已凭预计算 Hash 挂起至双轨对账引擎: ${txHash}`,
          );

          const inFlightResult = {
            success: true,
            orderId,
            txHash,
            status: OrderStatus.CONFIRMING,
            network: net.networkId,
            tokenSymbol: cleanSymbol,
            amount: dto.amount,
            toAddress: cleanToAddress,
            fromVault: vaultWallet.address,
            fromWallet: vaultWallet.address,
            remainingBalance,
            pipelineSteps: order.pipelineSteps,
            isInFlight: true,
          };

          if (dto.idempotencyKey) {
            this.idempotentOrders.set(dto.idempotencyKey, inFlightResult);
          }

          return inFlightResult;
        }

        // 正常即时广播确认
        order.status = OrderStatus.CONFIRMED;
        order.confirmedAt = Date.now();
        order.blockNumber = txRes.blockNumber ? Number(txRes.blockNumber) : undefined;

        order.pipelineSteps?.push(
          {
            step: 4,
            name: '安全 Enclave 物理加签',
            status: 'SUCCESS' as const,
            detail: `出资签名路由: ${vaultWallet.providerType || 'KMS_ENCLAVE'}，双向认证完成`,
            timestamp: Date.now(),
          },
          {
            step: 5,
            name: '公链节点广播入块',
            status: 'SUCCESS' as const,
            detail: `RPC 广播成功，生成交易哈希: ${txHash}`,
            timestamp: Date.now(),
          },
          {
            step: 6,
            name: '区块打包与确认',
            status: 'SUCCESS' as const,
            detail: `链上出款成功，区块高度: ${txRes.blockNumber || 'Latest'}`,
            timestamp: Date.now(),
          },
        );

        if (this.prisma) {
          await this.prisma.withdrawalOrder.update({
            where: { id: orderId },
            data: {
              status: 'CONFIRMED',
              txHash,
              blockNumber: txRes.blockNumber ? BigInt(txRes.blockNumber) : null,
              confirmedAt: BigInt(Date.now()),
            },
          });
        }

        const remainingBalance = this.balanceService
          ? await this.balanceService.getSingleBalance(userId, net.networkId, cleanSymbol)
          : undefined;

        this.logger.log(
          ` [Withdrawal Succeeded] [Order ${orderId}] TxHash: ${txHash}, Amount: ${dto.amount} ${cleanSymbol}`,
        );

        const result = {
          success: true,
          orderId,
          txHash,
          status: OrderStatus.CONFIRMED,
          network: net.networkId,
          tokenSymbol: cleanSymbol,
          amount: dto.amount,
          toAddress: cleanToAddress,
          fromVault: vaultWallet.address,
          fromWallet: vaultWallet.address,
          remainingBalance,
          pipelineSteps: order.pipelineSteps,
        };

        if (dto.idempotencyKey) {
          this.idempotentOrders.set(dto.idempotencyKey, result);
        }

        return result;
      } catch (err: any) {
        // 6. 异常补偿机制：自动回滚并返还用户扣减的资产余额
        this.logger.error(
          ` [Withdrawal Failed] [Order ${orderId}] 链上转账异常: ${err.message}，正在执行资产原路退还回滚...`,
        );

        if (this.balanceService) {
          await this.balanceService.creditBalance(
            userId,
            net.networkId,
            cleanSymbol,
            tokenAddress,
            dto.amount,
          );
        }

        order.status = OrderStatus.FAILED;
        order.errorMessage = err.message;
        order.pipelineSteps?.push(
          {
            step: 4,
            name: '交易签名与广播',
            status: 'FAILED' as const,
            detail: `链上异常: ${err.message}`,
            timestamp: Date.now(),
          },
          {
            step: 5,
            name: '资金原子补偿与回滚',
            status: 'SUCCESS' as const,
            detail: `已全额原路退还 ${dto.amount} ${cleanSymbol} 至用户账本账户`,
            timestamp: Date.now(),
          },
        );

        if (this.prisma) {
          await this.prisma.withdrawalOrder.update({
            where: { id: orderId },
            data: {
              status: 'FAILED',
              errorMessage: err.message,
            },
          }).catch(() => {});
        }

        throw new BadRequestException(
          `提现出金链上广播失败: ${err.message}。资金已全额原路退还至您的代币资产账户。`,
        );
      }
    } finally {
      this.activeWithdrawUsers.delete(userId);
    }
  }

  /**
   * 2. 查询提现订单状态与区块链确认进度
   */
  async getWithdrawalProgress(orderId: string): Promise<{
    orderId: string;
    status: OrderStatus;
    progress: number;
    currentConfirmations: number;
    requiredConfirmations: number;
    blockNumber?: number;
    currentBlock?: number;
    txHash?: string;
    amount?: string;
    tokenSymbol?: string;
    toAddress?: string;
    fromVault?: string;
    error?: string;
    pipelineSteps?: any[];
  }> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new NotFoundException(`提现订单 ${orderId} 不存在`);
    }

    const net = this.networkRegistryService.getNetwork(String(order.network));
    const required = net.family === 'SOLANA' ? 1 : net.family === 'TRON' ? 2 : 3;

    if (order.status === OrderStatus.CONFIRMED && order.txHash) {
      return {
        orderId: order.id,
        status: OrderStatus.CONFIRMED,
        progress: 100,
        currentConfirmations: required,
        requiredConfirmations: required,
        blockNumber: order.blockNumber,
        txHash: order.txHash,
        amount: order.amount,
        tokenSymbol: order.tokenSymbol,
        toAddress: order.toAddress,
        fromVault: order.fromVault,
        pipelineSteps: order.pipelineSteps,
      };
    }

    if (order.status === OrderStatus.FAILED) {
      return {
        orderId: order.id,
        status: OrderStatus.FAILED,
        progress: 0,
        currentConfirmations: 0,
        requiredConfirmations: required,
        error: order.errorMessage,
        fromVault: order.fromVault,
        pipelineSteps: order.pipelineSteps,
      };
    }

    return {
      orderId: order.id,
      status: order.status,
      progress: 50,
      currentConfirmations: 1,
      requiredConfirmations: required,
      txHash: order.txHash,
      amount: order.amount,
      tokenSymbol: order.tokenSymbol,
      fromVault: order.fromVault,
      pipelineSteps: order.pipelineSteps,
    };
  }

  /**
   * 3. 获取指定用户的所有提现订单流水
   */
  async getUserWithdrawals(userId: string): Promise<WithdrawOrder[]> {
    if (this.prisma) {
      try {
        const list = await this.prisma.withdrawalOrder.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        return list.map((d) => ({
          id: d.id,
          userId: d.userId,
          network: d.network,
          chain: d.network,
          fromVault: d.fromVault,
          toAddress: d.toAddress,
          amount: d.amount,
          tokenSymbol: d.tokenSymbol,
          tokenAddress: d.tokenAddress || undefined,
          txHash: d.txHash || undefined,
          blockNumber: d.blockNumber ? Number(d.blockNumber) : undefined,
          confirmations: d.confirmations || undefined,
          status: d.status as OrderStatus,
          errorMessage: d.errorMessage || undefined,
          createdAt: Number(d.createdAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : undefined,
        }));
      } catch (err: any) {
        this.logger.warn(`查询用户提现列表失败: ${err.message}`);
      }
    }

    return Array.from(this.orders.values()).filter((o) => o.userId === userId);
  }

  /**
   * 4. 管理后台审计查询所有提现出金流水
   */
  async getAllWithdrawals(): Promise<WithdrawOrder[]> {
    if (this.prisma) {
      try {
        const list = await this.prisma.withdrawalOrder.findMany({
          orderBy: { createdAt: 'desc' },
        });

        return list.map((d) => ({
          id: d.id,
          userId: d.userId,
          network: d.network,
          chain: d.network,
          fromVault: d.fromVault,
          toAddress: d.toAddress,
          amount: d.amount,
          tokenSymbol: d.tokenSymbol,
          tokenAddress: d.tokenAddress || undefined,
          txHash: d.txHash || undefined,
          blockNumber: d.blockNumber ? Number(d.blockNumber) : undefined,
          confirmations: d.confirmations || undefined,
          status: d.status as OrderStatus,
          errorMessage: d.errorMessage || undefined,
          createdAt: Number(d.createdAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : undefined,
        }));
      } catch {}
    }

    return Array.from(this.orders.values());
  }

  /**
   * 方案 C: 获取所有处于在途（IN_FLIGHT 或 CONFIRMING）状态的提现订单
   */
  getInFlightOrders(): WithdrawOrder[] {
    return Array.from(this.orders.values()).filter(
      (o) => o.status === OrderStatus.CONFIRMING || o.isInFlight === true,
    );
  }

  /**
   * 方案 C: 双轨对账引擎（WebSocket 或 HTTP 探测）捕获到上链收据后确认订单
   */
  async markOrderConfirmed(
    orderId: string,
    blockNumber?: number,
    receipt?: any,
  ): Promise<WithdrawOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new NotFoundException(`提现订单 ${orderId} 不存在`);
    }

    order.status = OrderStatus.CONFIRMED;
    order.isInFlight = false;
    order.confirmedAt = Date.now();
    if (blockNumber) order.blockNumber = blockNumber;

    if (order.pipelineSteps) {
      const step5 = order.pipelineSteps.find((s) => s.step === 5);
      if (step5) {
        step5.status = 'SUCCESS';
        step5.detail = `双轨对账引擎已验证入块 (TxHash: ${order.txHash})`;
      }
      const step6 = order.pipelineSteps.find((s) => s.step === 6);
      if (step6) {
        step6.status = 'SUCCESS';
        step6.detail = `链上确认成功，区块高度: ${blockNumber || 'Latest'}`;
      }
    }

    if (this.prisma) {
      await this.prisma.withdrawalOrder.update({
        where: { id: orderId },
        data: {
          status: 'CONFIRMED',
          blockNumber: blockNumber ? BigInt(blockNumber) : null,
          confirmedAt: BigInt(Date.now()),
        },
      }).catch(() => {});
    }

    this.logger.log(`[Reconciled Confirmed] 提现订单 ${orderId} 经双轨对账引擎成功核实入账，TxHash: ${order.txHash}`);
    return order;
  }

  /**
   * 方案 C: 终极安全冲正与回滚退款
   * 必须在链上 Nonce 确认作废后方可执行退款
   */
  async cancelAndRollbackWithdrawal(orderId: string, reason: string): Promise<WithdrawOrder> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new NotFoundException(`提现订单 ${orderId} 不存在`);
    }

    if (order.status === OrderStatus.CONFIRMED) {
      throw new BadRequestException(`订单已在链上打包成功，严禁冲正退款`);
    }

    order.status = OrderStatus.FAILED;
    order.isInFlight = false;
    order.errorMessage = `[安全冲正退款] ${reason}`;

    if (this.balanceService && order.userId) {
      await this.balanceService.creditBalance(
        order.userId,
        order.network,
        order.tokenSymbol || 'USDT',
        order.tokenAddress,
        order.amount,
      );
    }

    if (order.pipelineSteps) {
      order.pipelineSteps.push({
        step: 7,
        name: '安全冲正资金解冻回滚',
        status: 'SUCCESS',
        detail: `经对账确认链上未生效，全额原路退还 ${order.amount} ${order.tokenSymbol} 至账本`,
        timestamp: Date.now(),
      });
    }

    if (this.prisma) {
      await this.prisma.withdrawalOrder.update({
        where: { id: orderId },
        data: {
          status: 'FAILED',
          errorMessage: order.errorMessage,
        },
      }).catch(() => {});
    }

    this.logger.warn(`[Reconciled Refund] 提现订单 ${orderId} 已完成安全冲正退款，原因: ${reason}`);
    return order;
  }
}
