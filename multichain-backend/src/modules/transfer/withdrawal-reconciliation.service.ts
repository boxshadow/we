import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { WithdrawService } from './withdraw.service.js';
import { TransferService } from './transfer.service.js';
import { OrderStatus, WithdrawOrder } from './types/order.types.js';

export interface ReconciliationStatusReport {
  inFlightCount: number;
  lastRunAt: number;
  reconciledConfirmed: number;
  reconciledRescuedByNonce: number;
  reconciledRollbacks: number;
  orders: {
    orderId: string;
    txHash?: string;
    nonce?: number;
    network: string;
    status: OrderStatus;
    inFlightDurationMs: number;
    isInFlight: boolean;
  }[];
}

@Injectable()
export class WithdrawalReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WithdrawalReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private isReconciling = false;

  // 统计指标
  private stats = {
    reconciledConfirmed: 0,
    reconciledRescuedByNonce: 0,
    reconciledRollbacks: 0,
    lastRunAt: 0,
  };

  constructor(
    private readonly withdrawService: WithdrawService,
    private readonly transferService: TransferService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      // 启动 HTTP 兜底对账轮询 (每 5 秒轮询一次在途订单)
      this.timer = setInterval(() => {
        this.reconcileInFlightOrders().catch((err) => {
          this.logger.warn(`在途提现对账轮询异常: ${err.message}`);
        });
      }, 5000);
      this.logger.log('双轨提现对账引擎已启动 (WebSocket 实时订阅监听 + HTTP 5s 兜底轮询已就绪)');
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 轨道一: WebSocket / Socket 实时事件监听入口 (Push Mode)
   * 当 WebSocket 连接监听到链上新区块产生 (newHeads) 或日志触发时，调用此方法毫秒级结单
   */
  async handleWebSocketBlockEvent(
    networkId: string,
    blockNumber: number,
    txHashesInBlock: string[],
  ): Promise<{ matchedCount: number }> {
    const inFlightOrders = this.withdrawService.getInFlightOrders();
    let matchedCount = 0;

    const blockHashSet = new Set(txHashesInBlock.map((h) => h.toLowerCase()));

    for (const order of inFlightOrders) {
      if (!order.txHash) continue;
      const cleanHash = order.txHash.toLowerCase();

      // 只要在新块包含的交易列表中检测到该预计算哈希
      if (blockHashSet.has(cleanHash)) {
        this.logger.log(
          `[WebSocket Track Hit] 监听到新块 ${blockNumber} 包含在途提现订单 [${order.id}] 哈希: ${order.txHash}`,
        );
        await this.withdrawService.markOrderConfirmed(order.id, blockNumber);
        this.stats.reconciledConfirmed++;
        matchedCount++;
      }
    }

    return { matchedCount };
  }

  /**
   * 轨道二: HTTP 兜底轮询与 Nonce 探测挽救引擎 (Pull Mode & Nonce Rescue)
   * 负责探测在途订单的最新收据与 Nonce 状态，杜绝假死与双花
   */
  async reconcileInFlightOrders(): Promise<ReconciliationStatusReport> {
    if (this.isReconciling) {
      return this.getStatusReport();
    }

    this.isReconciling = true;
    this.stats.lastRunAt = Date.now();

    try {
      const inFlightOrders = this.withdrawService.getInFlightOrders();

      for (const order of inFlightOrders) {
        if (!order.txHash) continue;

        try {
          // 1. 通过 HTTP 向 RPC 节点核查收据
          const verifyResult = await this.transferService.verifyTx(order.chain, order.txHash);

          if (verifyResult.confirmed) {
            this.logger.log(
              `[HTTP Track Hit] 在途提现订单 ${order.id} 经 RPC 收据确认为打包成功 (高度: ${verifyResult.blockNumber})`,
            );
            await this.withdrawService.markOrderConfirmed(
              order.id,
              verifyResult.blockNumber || 0,
              verifyResult.rawReceipt,
            );
            this.stats.reconciledConfirmed++;
            continue;
          }

          // 2. 若未拿到收据，且挂起时间超过 10 秒，启动 Nonce 深度探针
          const inFlightDuration = Date.now() - order.createdAt;
          if (inFlightDuration > 10000 && order.nonce !== undefined && order.fromVault) {
            const latestNonce = await this.transferService.getNonce(order.chain, order.fromVault);

            // 分支 A: 链上已确认 Nonce > 订单使用的 Nonce
            // 这代表该交易（或该 Nonce）实打实地已经被区块链网络打包确认了！
            if (latestNonce > order.nonce) {
              this.logger.log(
                `[Nonce Rescue Probe Hit] 金库当前 Nonce (${latestNonce}) > 订单 Nonce (${order.nonce})，确定交易已入块打包！自动结单并救回订单: ${order.id}`,
              );
              await this.withdrawService.markOrderConfirmed(order.id, 0);
              this.stats.reconciledRescuedByNonce++;
              continue;
            }

            // 分支 B: 若超过最长超时窗口 (例如 15 分钟)，且 Nonce 依然没有推进
            // 此时可触发安全冲正与退款
            if (inFlightDuration > 15 * 60 * 1000) {
              this.logger.warn(
                `[Timeout Rescue] 订单 ${order.id} 超出最长等待窗口 (15m)，且链上 Nonce 确认未变，启动安全冲正退款`,
              );
              await this.withdrawService.cancelAndRollbackWithdrawal(
                order.id,
                '超过最长在途确认窗口且链上 Nonce 确认未推进，安全冲正解冻退款',
              );
              this.stats.reconciledRollbacks++;
            }
          }
        } catch (err: any) {
          this.logger.warn(`对账探测订单 ${order.id} 出现异常: ${err.message}`);
        }
      }
    } finally {
      this.isReconciling = false;
    }

    return this.getStatusReport();
  }

  /**
   * 手动单笔触发 Nonce 冲正退款 (管理后台或运维专用)
   */
  async manualCancelWithHardReplace(orderId: string, reason: string): Promise<WithdrawOrder> {
    return this.withdrawService.cancelAndRollbackWithdrawal(orderId, reason);
  }

  getStatusReport(): ReconciliationStatusReport {
    const inFlightOrders = this.withdrawService.getInFlightOrders();
    const now = Date.now();

    return {
      inFlightCount: inFlightOrders.length,
      lastRunAt: this.stats.lastRunAt,
      reconciledConfirmed: this.stats.reconciledConfirmed,
      reconciledRescuedByNonce: this.stats.reconciledRescuedByNonce,
      reconciledRollbacks: this.stats.reconciledRollbacks,
      orders: inFlightOrders.map((o) => ({
        orderId: o.id,
        txHash: o.txHash,
        nonce: o.nonce,
        network: o.network,
        status: o.status,
        inFlightDurationMs: now - o.createdAt,
        isInFlight: !!o.isInFlight,
      })),
    };
  }
}
