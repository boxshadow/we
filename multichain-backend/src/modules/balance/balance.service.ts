import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface UserBalanceEntity {
  id: string;
  userId: string;
  networkId: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  balance: string;
  updatedAt: number;
}

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  // 内存备份 Map: `${userId}:${networkId}:${tokenSymbol.toUpperCase()}` -> UserBalanceEntity
  private memoryBalances = new Map<string, UserBalanceEntity>();

  // 用户资产排队原子互斥锁 (User-Level Account Mutex)
  // 杜绝并发提现双花攻击 (Race Condition / Double-Spending Prevention)
  private userLocks = new Map<string, Promise<any>>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private getKey(userId: string, networkId: string, tokenSymbol: string): string {
    return `${userId}:${networkId}:${tokenSymbol.toUpperCase()}`;
  }

  /**
   * 保证单个用户维度的资金入账/扣减完全串行化排队执行，防止多请求竞态
   */
  private async runWithUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = this.userLocks.get(userId) || Promise.resolve();
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.userLocks.set(userId, prevLock.then(() => nextLock));

    try {
      await prevLock;
      return await fn();
    } finally {
      release!();
      if (this.userLocks.get(userId) === nextLock) {
        this.userLocks.delete(userId);
      }
    }
  }

  /**
   * 给用户充值入账增加代币余额 (支持多种 Token，每个 Token 单独存放)
   * 采用 BigNumber 运算，严格杜绝浮点数精度漂移
   */
  async creditBalance(
    userId: string,
    networkId: string,
    tokenSymbol: string,
    tokenAddress: string | null | undefined,
    amount: string,
  ): Promise<UserBalanceEntity> {
    return this.runWithUserLock(userId, async () => {
      const amountBn = new BigNumber(amount);
      if (amountBn.isNaN() || amountBn.isLessThanOrEqualTo(0)) {
        throw new BadRequestException(`无效的充值入账金额: ${amount}`);
      }

      const cleanSymbol = tokenSymbol.trim().toUpperCase();
      const cleanTokenAddress = tokenAddress ? tokenAddress.trim() : null;
      const now = Date.now();

      if (this.prisma) {
        try {
          const existing = await this.prisma.userBalance.findUnique({
            where: {
              userId_networkId_tokenSymbol: {
                userId,
                networkId,
                tokenSymbol: cleanSymbol,
              },
            },
          });

          const oldBalanceBn = new BigNumber(existing?.balance || '0');
          const newBalanceBn = oldBalanceBn.plus(amountBn);
          const newBalanceStr = newBalanceBn.toString();

          const updated = await this.prisma.userBalance.upsert({
            where: {
              userId_networkId_tokenSymbol: {
                userId,
                networkId,
                tokenSymbol: cleanSymbol,
              },
            },
            update: {
              balance: newBalanceStr,
              tokenAddress: cleanTokenAddress,
              updatedAt: BigInt(now),
            },
            create: {
              userId,
              networkId,
              tokenSymbol: cleanSymbol,
              tokenAddress: cleanTokenAddress,
              balance: newBalanceStr,
              updatedAt: BigInt(now),
            },
          });

          this.logger.log(
            ` [Balance Credited] User=${userId}, Net=${networkId}, Token=${cleanSymbol}, Add=+${amount}, NewBalance=${newBalanceStr}`,
          );

          return {
            id: updated.id,
            userId: updated.userId,
            networkId: updated.networkId,
            tokenSymbol: updated.tokenSymbol,
            tokenAddress: updated.tokenAddress,
            balance: updated.balance,
            updatedAt: Number(updated.updatedAt),
          };
        } catch (err: any) {
          this.logger.warn(`Prisma 写入用户代币余额异常: ${err.message}`);
        }
      }

      // 内存降级处理
      const key = this.getKey(userId, networkId, cleanSymbol);
      const existing = this.memoryBalances.get(key);
      const oldBalanceBn = new BigNumber(existing?.balance || '0');
      const newBalanceStr = oldBalanceBn.plus(amountBn).toString();

      const entity: UserBalanceEntity = {
        id: existing?.id || `bal-${now}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        networkId,
        tokenSymbol: cleanSymbol,
        tokenAddress: cleanTokenAddress,
        balance: newBalanceStr,
        updatedAt: now,
      };
      this.memoryBalances.set(key, entity);

      this.logger.log(
        ` [Memory Balance Credited] User=${userId}, Net=${networkId}, Token=${cleanSymbol}, Add=+${amount}, NewBalance=${newBalanceStr}`,
      );
      return entity;
    });
  }

  /**
   * 用户提现时扣减代币余额
   * 采用 BigNumber 运算与用户级原子排队锁，严格防负数/超扣/并发双花
   */
  async debitBalance(
    userId: string,
    networkId: string,
    tokenSymbol: string,
    amount: string,
  ): Promise<UserBalanceEntity> {
    return this.runWithUserLock(userId, async () => {
      const amountBn = new BigNumber(amount);
      if (amountBn.isNaN() || amountBn.isLessThanOrEqualTo(0)) {
        throw new BadRequestException(`无效的提现扣除金额: ${amount}`);
      }

      const cleanSymbol = tokenSymbol.trim().toUpperCase();
      const now = Date.now();

      if (this.prisma) {
        try {
          const existing = await this.prisma.userBalance.findUnique({
            where: {
              userId_networkId_tokenSymbol: {
                userId,
                networkId,
                tokenSymbol: cleanSymbol,
              },
            },
          });

          const currentBalanceBn = new BigNumber(existing?.balance || '0');
          if (currentBalanceBn.isLessThan(amountBn)) {
            throw new BadRequestException(
              `用户在 [${networkId}] 的 [${cleanSymbol}] 资产余额不足 (当前: ${currentBalanceBn.toString()}, 提现需要: ${amount})`,
            );
          }

          const newBalanceStr = currentBalanceBn.minus(amountBn).toString();
          const updated = await this.prisma.userBalance.update({
            where: {
              userId_networkId_tokenSymbol: {
                userId,
                networkId,
                tokenSymbol: cleanSymbol,
              },
            },
            data: {
              balance: newBalanceStr,
              updatedAt: BigInt(now),
            },
          });

          this.logger.log(
            ` [Balance Debited] User=${userId}, Net=${networkId}, Token=${cleanSymbol}, Minus=-${amount}, Remaining=${newBalanceStr}`,
          );

          return {
            id: updated.id,
            userId: updated.userId,
            networkId: updated.networkId,
            tokenSymbol: updated.tokenSymbol,
            tokenAddress: updated.tokenAddress,
            balance: updated.balance,
            updatedAt: Number(updated.updatedAt),
          };
        } catch (err: any) {
          if (err instanceof BadRequestException) throw err;
          this.logger.warn(`Prisma 扣减用户代币余额异常: ${err.message}`);
        }
      }

      // 内存降级处理
      const key = this.getKey(userId, networkId, cleanSymbol);
      const existing = this.memoryBalances.get(key);
      const currentBalanceBn = new BigNumber(existing?.balance || '0');
      if (currentBalanceBn.isLessThan(amountBn)) {
        throw new BadRequestException(
          `用户在 [${networkId}] 的 [${cleanSymbol}] 资产余额不足 (当前: ${currentBalanceBn.toString()}, 提现需要: ${amount})`,
        );
      }

      const newBalanceStr = currentBalanceBn.minus(amountBn).toString();
      const entity: UserBalanceEntity = {
        id: existing?.id || `bal-${now}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        networkId,
        tokenSymbol: cleanSymbol,
        tokenAddress: existing?.tokenAddress || null,
        balance: newBalanceStr,
        updatedAt: now,
      };
      this.memoryBalances.set(key, entity);

      this.logger.log(
        ` [Memory Balance Debited] User=${userId}, Net=${networkId}, Token=${cleanSymbol}, Minus=-${amount}, Remaining=${newBalanceStr}`,
      );
      return entity;
    });
  }

  /**
   * 获取用户在各链上所有 Token 的资产余额列表
   */
  async getUserBalances(userId: string): Promise<UserBalanceEntity[]> {
    if (this.prisma) {
      try {
        const list = await this.prisma.userBalance.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        });

        return list.map((b) => ({
          id: b.id,
          userId: b.userId,
          networkId: b.networkId,
          tokenSymbol: b.tokenSymbol,
          tokenAddress: b.tokenAddress,
          balance: b.balance,
          updatedAt: Number(b.updatedAt),
        }));
      } catch (err: any) {
        this.logger.warn(`查询用户代币余额失败: ${err.message}`);
      }
    }

    return Array.from(this.memoryBalances.values()).filter(
      (b) => b.userId === userId,
    );
  }

  /**
   * 获取用户指定代币的当前余额
   */
  async getSingleBalance(
    userId: string,
    networkId: string,
    tokenSymbol: string,
  ): Promise<string> {
    const cleanSymbol = tokenSymbol.trim().toUpperCase();
    if (this.prisma) {
      try {
        const item = await this.prisma.userBalance.findUnique({
          where: {
            userId_networkId_tokenSymbol: {
              userId,
              networkId,
              tokenSymbol: cleanSymbol,
            },
          },
        });
        return item?.balance || '0';
      } catch {}
    }
    const key = this.getKey(userId, networkId, cleanSymbol);
    return this.memoryBalances.get(key)?.balance || '0';
  }

  /**
   * 管理后台查询全平台所有用户资产余额
   */
  async getAllBalances(): Promise<UserBalanceEntity[]> {
    if (this.prisma) {
      try {
        const list = await this.prisma.userBalance.findMany({
          orderBy: { updatedAt: 'desc' },
        });
        return list.map((b) => ({
          id: b.id,
          userId: b.userId,
          networkId: b.networkId,
          tokenSymbol: b.tokenSymbol,
          tokenAddress: b.tokenAddress,
          balance: b.balance,
          updatedAt: Number(b.updatedAt),
        }));
      } catch {}
    }
    return Array.from(this.memoryBalances.values());
  }
}
