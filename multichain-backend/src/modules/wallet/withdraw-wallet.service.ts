import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';

export interface AddWithdrawWalletDto {
  chain: string; // 'EVM' | 'SOLANA' | 'TRON'
  address: string;
  label?: string;
  balance?: string;
  dailyLimit?: string;
}

export interface WithdrawWalletEntity {
  id: string;
  chain: string; // EVM, SOLANA, TRON
  address: string;
  label?: string | null;
  balance: string;
  dailyLimit: string;
  spentToday: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class WithdrawWalletService implements OnModuleInit {
  private readonly logger = new Logger(WithdrawWalletService.name);
  private memoryWallets: WithdrawWalletEntity[] = [];

  constructor(
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      await this.initDefaultWallets();
    }
  }

  /**
   * 初始化多链提现出金热钱包池 (分为 EVM, SOLANA, TRON 三大组)
   */
  async initDefaultWallets() {
    if (!this.prisma) return;
    try {
      const count = await this.prisma.configuredWithdrawWallet.count();
      if (count === 0) {
        this.logger.log(' 正在预设多链提现出资热钱包池 (EVM / SOLANA / TRON)...');
        const defaults = [
          {
            chain: 'EVM',
            address: '0x1111111111111111111111111111111111111111',
            label: 'EVM01',
            balance: '250000.00',
            dailyLimit: '100000.00',
          },
          {
            chain: 'TRON',
            address: 't9yd14nj9j7xab4dbgeix9h8unkkhxuwwb',
            label: 'TRON01',
            balance: '180000.00',
            dailyLimit: '100000.00',
          },
          {
            chain: 'SOLANA',
            address: 'solanaaddress111111111111111111111111111111',
            label: 'SOL01',
            balance: '5000.00',
            dailyLimit: '50000.00',
          },
        ];

        const now = Date.now();
        for (const item of defaults) {
          await this.prisma.configuredWithdrawWallet.create({
            data: {
              chain: item.chain,
              address: item.address,
              label: item.label,
              balance: item.balance,
              dailyLimit: item.dailyLimit,
              spentToday: '0',
              isActive: true,
              createdAt: BigInt(now),
              updatedAt: BigInt(now),
            },
          });
        }
        this.logger.log(` 已成功初始化预设 ${defaults.length} 个多链提现出金热钱包`);
      } else {
        // 自动更新已有长标签为短格式 (如 EVM01, TRON01, SOL01)
        const existing = await this.prisma.configuredWithdrawWallet.findMany();
        for (const w of existing) {
          const curLabel = w.label || '';
          let newLabel = curLabel;
          if (curLabel.includes('EVM') && (curLabel.includes('平台') || curLabel.includes('综合'))) {
            newLabel = 'EVM01';
          } else if (curLabel.includes('TRON') && curLabel.includes('快速')) {
            newLabel = 'TRON01';
          } else if (curLabel.includes('Solana') && curLabel.includes('储备')) {
            newLabel = 'SOL01';
          }
          if (newLabel !== curLabel) {
            await this.prisma.configuredWithdrawWallet.update({
              where: { id: w.id },
              data: { label: newLabel },
            });
            this.logger.log(`[Admin] 提现热钱包标签已更新为短格式: ${curLabel} -> ${newLabel}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`初始化默认提现钱包池异常: ${err.message}`);
    }
  }

  /**
   * 查询所有配置的提现出资钱包 (支持按 chain: EVM / SOLANA / TRON 筛选)
   */
  async listWallets(chain?: string): Promise<WithdrawWalletEntity[]> {
    const chainFilter = chain ? chain.toUpperCase() : undefined;

    if (this.prisma) {
      try {
        const where = chainFilter ? { chain: chainFilter } : {};
        const list = await this.prisma.configuredWithdrawWallet.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
        return list.map((w) => ({
          id: w.id,
          chain: w.chain,
          address: w.address,
          label: w.label,
          balance: w.balance,
          dailyLimit: w.dailyLimit,
          spentToday: w.spentToday,
          isActive: w.isActive,
          createdAt: Number(w.createdAt),
          updatedAt: Number(w.updatedAt),
        }));
      } catch (err: any) {
        this.logger.warn(`查询提现钱包列表失败: ${err.message}`);
      }
    }

    return chainFilter
      ? this.memoryWallets.filter((w) => w.chain.toUpperCase() === chainFilter)
      : this.memoryWallets;
  }

  /**
   * 随机挑选一个指定公链/网络处于激活状态的提现出款热钱包
   */
  async getRandomActiveWithdrawWallet(chainOrNetwork: string): Promise<WithdrawWalletEntity> {
    let targetChain = 'EVM';
    try {
      const net = this.networkRegistryService.getNetwork(chainOrNetwork);
      targetChain = net.family;
    } catch {
      const upper = chainOrNetwork.toUpperCase();
      if (['EVM', 'SOLANA', 'TRON'].includes(upper)) {
        targetChain = upper;
      } else if (upper.includes('TRON')) {
        targetChain = 'TRON';
      } else if (upper.includes('SOLANA')) {
        targetChain = 'SOLANA';
      }
    }

    const all = await this.listWallets(targetChain);
    const actives = all.filter((w) => w.isActive);

    if (actives.length === 0) {
      // 优雅容错默认钱包
      const fallbackAddr =
        targetChain === 'EVM'
          ? '0x1111111111111111111111111111111111111111'
          : targetChain === 'TRON'
            ? 't9yd14nj9j7xab4dbgeix9h8unkkhxuwwb'
            : 'solanaaddress111111111111111111111111111111';
      return {
        id: `fallback-withdraw-${targetChain}`,
        chain: targetChain,
        address: fallbackAddr,
        label: `${targetChain} 默认出金钱包`,
        balance: '100000.00',
        dailyLimit: '100000.00',
        spentToday: '0',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    const idx = Math.floor(Math.random() * actives.length);
    return actives[idx];
  }

  /**
   * 新增提现出金热钱包
   */
  async addWallet(dto: AddWithdrawWalletDto): Promise<WithdrawWalletEntity> {
    const cleanAddress = dto.address.trim();
    if (!cleanAddress) {
      throw new BadRequestException('提现钱包地址不能为空');
    }

    const targetChain = (dto.chain || 'EVM').toUpperCase();
    if (!['EVM', 'SOLANA', 'TRON'].includes(targetChain)) {
      throw new BadRequestException('无效的公链生态类别，仅支持 EVM, SOLANA, TRON');
    }

    // 地址合法性校验
    if (targetChain === 'EVM') {
      if (!cleanAddress.startsWith('0x') || cleanAddress.length !== 42) {
        throw new BadRequestException('EVM 提现钱包地址必须为 0x 开头的 42 位十六进制公钥');
      }
    } else if (targetChain === 'TRON') {
      if (!cleanAddress.startsWith('T') || cleanAddress.length !== 34) {
        throw new BadRequestException('TRON 提现钱包地址必须为 T 开头的 34 位 Base58Check 格式');
      }
    } else if (targetChain === 'SOLANA') {
      if (cleanAddress.length < 32 || cleanAddress.length > 44) {
        throw new BadRequestException('Solana 提现钱包地址必须为 32-44 位的 Base58 格式');
      }
    }

    const now = Date.now();
    if (this.prisma) {
      const existing = await this.prisma.configuredWithdrawWallet.findUnique({
        where: {
          chain_address: {
            chain: targetChain,
            address: cleanAddress,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `生态 [${targetChain}] 下已存在相同的提现出金钱包: ${cleanAddress}`,
        );
      }

      const created = await this.prisma.configuredWithdrawWallet.create({
        data: {
          chain: targetChain,
          address: cleanAddress,
          label: dto.label || `${targetChain} 出金热钱包`,
          balance: dto.balance || '100000.00',
          dailyLimit: dto.dailyLimit || '100000.00',
          spentToday: '0',
          isActive: true,
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });

      this.logger.log(`[Admin] 新增提现出资钱包: [${targetChain}] ${cleanAddress}`);
      return {
        id: created.id,
        chain: created.chain,
        address: created.address,
        label: created.label,
        balance: created.balance,
        dailyLimit: created.dailyLimit,
        spentToday: created.spentToday,
        isActive: created.isActive,
        createdAt: Number(created.createdAt),
        updatedAt: Number(created.updatedAt),
      };
    }

    const entity: WithdrawWalletEntity = {
      id: `mem-w-${now}-${Math.random().toString(36).slice(2, 6)}`,
      chain: targetChain,
      address: cleanAddress,
      label: dto.label || `${targetChain} 出金热钱包`,
      balance: dto.balance || '100000.00',
      dailyLimit: dto.dailyLimit || '100000.00',
      spentToday: '0',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.memoryWallets.push(entity);
    return entity;
  }

  /**
   * 切换提现钱包激活状态
   */
  async toggleActive(id: string, isActive?: boolean): Promise<WithdrawWalletEntity> {
    if (this.prisma) {
      const target = await this.prisma.configuredWithdrawWallet.findUnique({
        where: { id },
      });
      if (!target) throw new NotFoundException(`提现钱包配置 ${id} 不存在`);

      const nextStatus = isActive !== undefined ? isActive : !target.isActive;
      const updated = await this.prisma.configuredWithdrawWallet.update({
        where: { id },
        data: {
          isActive: nextStatus,
          updatedAt: BigInt(Date.now()),
        },
      });

      return {
        id: updated.id,
        chain: updated.chain,
        address: updated.address,
        label: updated.label,
        balance: updated.balance,
        dailyLimit: updated.dailyLimit,
        spentToday: updated.spentToday,
        isActive: updated.isActive,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt),
      };
    }

    const item = this.memoryWallets.find((w) => w.id === id);
    if (!item) throw new NotFoundException(`提现钱包配置 ${id} 不存在`);
    item.isActive = isActive !== undefined ? isActive : !item.isActive;
    item.updatedAt = Date.now();
    return item;
  }

  /**
   * 更新提现出金热钱包配置 (支持修改 label, balance, dailyLimit, isActive)
   */
  async updateWallet(
    id: string,
    dto: { label?: string; balance?: string; dailyLimit?: string; isActive?: boolean },
  ): Promise<WithdrawWalletEntity> {
    if (this.prisma) {
      const target = await this.prisma.configuredWithdrawWallet.findUnique({ where: { id } });
      if (!target) throw new NotFoundException(`提现钱包配置 ${id} 不存在`);

      const updated = await this.prisma.configuredWithdrawWallet.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? dto.label.trim() : target.label,
          balance: dto.balance !== undefined ? String(dto.balance) : target.balance,
          dailyLimit: dto.dailyLimit !== undefined ? String(dto.dailyLimit) : target.dailyLimit,
          isActive: dto.isActive !== undefined ? dto.isActive : target.isActive,
          updatedAt: BigInt(Date.now()),
        },
      });

      return {
        id: updated.id,
        chain: updated.chain,
        address: updated.address,
        label: updated.label,
        balance: updated.balance,
        dailyLimit: updated.dailyLimit,
        spentToday: updated.spentToday,
        isActive: updated.isActive,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt),
      };
    }

    const item = this.memoryWallets.find((w) => w.id === id);
    if (!item) throw new NotFoundException(`提现钱包配置 ${id} 不存在`);
    if (dto.label !== undefined) item.label = dto.label.trim();
    if (dto.balance !== undefined) item.balance = String(dto.balance);
    if (dto.dailyLimit !== undefined) item.dailyLimit = String(dto.dailyLimit);
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    item.updatedAt = Date.now();
    return item;
  }

  /**
   * 删除提现钱包
   */
  async deleteWallet(id: string): Promise<boolean> {
    if (this.prisma) {
      await this.prisma.configuredWithdrawWallet.delete({ where: { id } });
      this.logger.log(`[Admin] 删除提现出款钱包: ID=${id}`);
      return true;
    }
    const idx = this.memoryWallets.findIndex((w) => w.id === id);
    if (idx !== -1) {
      this.memoryWallets.splice(idx, 1);
      return true;
    }
    return false;
  }
}
