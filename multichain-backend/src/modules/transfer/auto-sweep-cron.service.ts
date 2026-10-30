import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import BigNumber from 'bignumber.js';
import { SweepService } from './sweep.service.js';
import { WalletSignerManager } from '../wallet/wallet-signer.manager.js';
import { WalletPurpose } from '../wallet/interfaces/wallet-account.interface.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';
import { TransferService } from './transfer.service.js';
import { ChainType } from '../../common/enums/chain-type.enum.js';

export interface AutoSweepStatus {
  enabled: boolean;
  minThreshold: string;
  intervalDescription: string;
  lastCheckAt: number | null;
  lastSweptAt: number | null;
  totalSweptCount: number;
}

@Injectable()
export class AutoSweepCronService {
  private readonly logger = new Logger(AutoSweepCronService.name);
  private isEnabled = true;
  private isScanning = false;
  private minThreshold = '0.05';
  private lastCheckAt: number | null = null;
  private lastSweptAt: number | null = null;
  private totalSweptCount = 0;

  constructor(
    private readonly sweepService: SweepService,
    private readonly walletSignerManager: WalletSignerManager,
    private readonly networkRegistryService: NetworkRegistryService,
    private readonly transferService: TransferService,
  ) {}

  /**
   * 定时巡检任务：每 30 秒自动巡检各个链上的充值地址资金
   * 当充值地址余额达到设定的归集阈值时，自动触发归集到冷金库/提现热钱包
   */
  @Cron('*/30 * * * * *')
  async handleAutoSweepRoutine() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }
    if (!this.isEnabled || this.isScanning) {
      return;
    }

    this.isScanning = true;
    this.lastCheckAt = Date.now();

    try {
      const allNetworks = this.networkRegistryService.getAllNetworks();

      for (const net of allNetworks) {
        if (net.security.isPaused) continue;

        try {
          const depositWallet = await this.walletSignerManager.getRandomDepositWallet(net.family);
          if (!depositWallet || depositWallet.purpose !== WalletPurpose.DEPOSIT) continue;

          const balanceStr = await this.transferService.getBalance(net.networkId, depositWallet.address);
          const balance = new BigNumber(balanceStr);

          // 若余额超过归集阈值，自动执行归集
          if (balance.isGreaterThanOrEqualTo(this.minThreshold)) {
            const withdrawWallet = await this.walletSignerManager.getRandomWithdrawWallet(net.family);
            const targetAddress = withdrawWallet.address;

            this.logger.log(
              ` [Auto-Sweep Triggered] [${net.networkId}] Address: ${depositWallet.address} has ${balanceStr} (>= ${this.minThreshold}). Sweeping to ${targetAddress}...`,
            );

            await this.sweepService.sweepDepositFunds({
              network: net.networkId,
              fromDepositWallet: depositWallet.address,
              toTargetAddress: targetAddress,
            });

            this.lastSweptAt = Date.now();
            this.totalSweptCount++;
          }
        } catch {
          // 单个网络余额不足或归集失败不阻塞其它网络
        }
      }
    } catch (err: any) {
      this.logger.warn(`自动归集巡检异常: ${err.message}`);
    } finally {
      this.isScanning = false;
    }
  }

  getStatus(): AutoSweepStatus {
    return {
      enabled: this.isEnabled,
      minThreshold: this.minThreshold,
      intervalDescription: 'Every 30 seconds',
      lastCheckAt: this.lastCheckAt,
      lastSweptAt: this.lastSweptAt,
      totalSweptCount: this.totalSweptCount,
    };
  }

  toggle(enabled?: boolean): AutoSweepStatus {
    this.isEnabled = enabled !== undefined ? enabled : !this.isEnabled;
    this.logger.log(` 自动化归集定时任务状态切换: ${this.isEnabled ? 'ENABLED' : 'PAUSED'}`);
    return this.getStatus();
  }

  setMinThreshold(threshold: string): AutoSweepStatus {
    this.minThreshold = threshold;
    this.logger.log(` 自动化归集最小触发阈值更新为: ${this.minThreshold}`);
    return this.getStatus();
  }
}
