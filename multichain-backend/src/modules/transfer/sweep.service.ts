import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import BigNumber from 'bignumber.js';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { WalletSignerManager } from '../wallet/wallet-signer.manager.js';
import { WalletPurpose } from '../wallet/interfaces/wallet-account.interface.js';
import { TransferService } from './transfer.service.js';
import { TxResult } from '../../common/types/common.types.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SweepDto {
  @ApiProperty({ description: '网络名称 (如 ethereum, bsc, solana, tron)', example: 'ethereum' })
  network!: ChainType | string;

  @ApiProperty({ description: '归集源地址：必须是系统白名单内的 DEPOSIT 充值专属收款地址', example: '0xDepositOnlyWallet111111111111111111111111' })
  fromDepositWallet!: string;

  @ApiProperty({ description: '归集目标地址：平台主冷金库(Treasury) 或 出金热钱包(Withdraw Wallet)', example: '0xTreasuryColdVault222222222222222222222222' })
  toTargetAddress!: string;

  @ApiPropertyOptional({ description: '代币合约地址 (若不填则归集底层原生币)', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' })
  tokenAddress?: string;

  @ApiPropertyOptional({ description: '归集金额 (若不填则自动扣除 Gas 后全额归集)', example: '50.0' })
  amount?: string;
}

export interface SweepResult {
  sweepId: string;
  network: ChainType | string;
  fromDepositWallet: string;
  toTargetAddress: string;
  amount: string;
  tokenAddress?: string;
  txHash: string;
  timestamp: number;
}

/**
 * 资金归集服务 (SweepService)
 * 充提分离架构的生命周期闭环：
 * 用户入金  充值地址池(Deposit Wallets)  归集汇总(Sweep)  金库 / 出金热钱包(Withdraw Wallets)
 */
@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    private readonly walletSignerManager: WalletSignerManager,
    private readonly transferService: TransferService,
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * 将散落在充值地址中的资金归集汇总到指定金库或出金热钱包
   */
  async sweepDepositFunds(dto: SweepDto): Promise<SweepResult> {
    const sweepId = randomUUID();
    const net = this.networkRegistryService.getNetwork(dto.network);
    if (net.security.isPaused) {
      throw new BadRequestException(
        `Network "${net.name}" (${net.networkId}) is currently paused for maintenance.`,
      );
    }

    // 1. 查找源充值钱包
    const depositWallet = await this.walletSignerManager.getWalletByAddress(
      net.family,
      dto.fromDepositWallet,
    );

    if (!depositWallet) {
      throw new NotFoundException(
        `Source deposit wallet ${dto.fromDepositWallet} not found in wallet pool`,
      );
    }

    // 2. 严格安全审计：源地址必须是 DEPOSIT 充值专属钱包，严禁对出金钱包发起归集
    if (depositWallet.purpose !== WalletPurpose.DEPOSIT) {
      throw new BadRequestException(
        `[Security Violation] Wallet ${depositWallet.address} is ${depositWallet.purpose}, not a DEPOSIT wallet!`,
      );
    }

    // 3. 查询当前可归集链上余额
    const currentBalance = await this.transferService.getBalance(
      net.networkId,
      depositWallet.address,
      dto.tokenAddress,
    );

    const balanceBn = new BigNumber(currentBalance);
    if (balanceBn.isLessThanOrEqualTo(0)) {
      throw new BadRequestException(
        `Deposit wallet ${depositWallet.address} balance is zero (${currentBalance}), nothing to sweep`,
      );
    }

    // 若未指定金额，则全额归集（代币全额，原生币预留微量 Gas）
    let sweepAmount = dto.amount;
    if (!sweepAmount) {
      if (dto.tokenAddress) {
        sweepAmount = currentBalance;
      } else {
        // 原生币预留 Gas (EVM 0.002, Solana 0.001, Tron 5)
        const reserveGas =
          net.family === ChainType.EVM
            ? '0.002'
            : net.family === ChainType.SOLANA
              ? '0.001'
              : '5';
        const sweepable = balanceBn.minus(reserveGas);
        if (sweepable.isLessThanOrEqualTo(0)) {
          throw new BadRequestException(
            `Insufficient native balance to cover gas reserve for sweeping. Current: ${currentBalance}`,
          );
        }
        sweepAmount = sweepable.toString();
      }
    }

    this.logger.log(
      `[Fund Sweeping] [${net.networkId}] Sweeping ${sweepAmount} from Deposit Wallet ${depositWallet.address} to Treasury ${dto.toTargetAddress}...`,
    );

    // 4. 执行链上转账出资
    const txResult: TxResult = await this.transferService.transfer(dto.network, {
      to: dto.toTargetAddress,
      amount: sweepAmount,
      tokenAddress: dto.tokenAddress,
      networkId: net.networkId,
      signerWallet: depositWallet,
    });

    if (!txResult.success || !txResult.txHash) {
      throw new BadRequestException(`Sweep transaction failed: ${txResult.error}`);
    }

    const timestamp = Date.now();

    // 5. 持久化归集记录到 Prisma 审计表
    if (this.prisma) {
      this.prisma.sweepRecord.create({
        data: {
          id: sweepId,
          network: String(dto.network),
          fromDepositWallet: depositWallet.address,
          toTargetAddress: dto.toTargetAddress,
          amount: sweepAmount,
          tokenAddress: dto.tokenAddress || null,
          txHash: txResult.txHash,
          status: 'SUCCESS',
          timestamp: BigInt(timestamp),
        },
      }).catch((err) => {
        this.logger.warn(`Prisma 归集审计记录持久化异常: ${err.message}`);
      });
    }

    this.logger.log(
      ` [Fund Sweeping Completed] TxHash: ${txResult.txHash}`,
    );

    return {
      sweepId,
      network: dto.network,
      fromDepositWallet: depositWallet.address,
      toTargetAddress: dto.toTargetAddress,
      amount: sweepAmount,
      tokenAddress: dto.tokenAddress,
      txHash: txResult.txHash,
      timestamp,
    };
  }

  /**
   * 查询充值专属钱包的待归集余额及审计状态 (供管理后台使用)
   */
  async getSweepableBalance(
    networkOrChain: string | ChainType,
    depositAddress: string,
    tokenAddress?: string,
  ): Promise<{
    network: string;
    depositWallet: string;
    balance: string;
    tokenAddress?: string;
    isValidDepositWallet: boolean;
  }> {
    const net = this.networkRegistryService.getNetwork(networkOrChain);
    const depositWallet = await this.walletSignerManager.getWalletByAddress(
      net.family,
      depositAddress,
    );

    if (!depositWallet || depositWallet.purpose !== WalletPurpose.DEPOSIT) {
      throw new BadRequestException(
        `Address ${depositAddress} is not a registered DEPOSIT wallet in network ${net.networkId}`,
      );
    }

    const balance = await this.transferService.getBalance(
      net.networkId,
      depositAddress,
      tokenAddress,
    );

    return {
      network: net.networkId,
      depositWallet: depositAddress,
      balance,
      tokenAddress,
      isValidDepositWallet: true,
    };
  }

  /**
   * 查询归集流水历史记录
   */
  async getSweepHistory(limit = 50) {
    if (this.prisma) {
      try {
        const list = await this.prisma.sweepRecord.findMany({
          take: limit,
          orderBy: { timestamp: 'desc' },
        });
        return list.map((r) => ({
          ...r,
          timestamp: Number(r.timestamp),
        }));
      } catch (err: any) {
        this.logger.warn(`查询归集流水失败: ${err.message}`);
      }
    }
    return [];
  }
}
