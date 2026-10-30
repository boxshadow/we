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

export interface AddDepositWalletDto {
  chain: string; // 'EVM' | 'SOLANA' | 'TRON' (三大核心生态)
  address: string;
  label?: string;
  networkId?: string; // 可选，若传入则可补充具体关联
}

export interface DepositWalletEntity {
  id: string;
  networkId?: string | null;
  chain: string; // EVM, SOLANA, TRON
  address: string;
  label?: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class DepositWalletService implements OnModuleInit {
  private readonly logger = new Logger(DepositWalletService.name);

  // 内存备份缓存
  private memoryWallets: DepositWalletEntity[] = [];

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
   * 初始化默认各链充值专属收款钱包（若数据库为空则自动预设）
   */
  async initDefaultWallets() {
    if (!this.prisma) return;
    try {
      const count = await this.prisma.configuredDepositWallet.count();
      if (count === 0) {
        this.logger.log(' 正在预设多链充值收款专属钱包池...');
        const defaults = [
          {
            networkId: 'ethereum',
            chain: 'EVM',
            address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            label: 'EVM01',
          },
          {
            networkId: 'ethereum',
            chain: 'EVM',
            address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            label: 'EVM02',
          },
          {
            networkId: 'bsc',
            chain: 'EVM',
            address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            label: 'EVM03',
          },
          {
            networkId: 'tron',
            chain: 'TRON',
            address: 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT',
            label: 'TRON01',
          },
          {
            networkId: 'solana',
            chain: 'SOLANA',
            address: 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb',
            label: 'SOL01',
          },
        ];

        const now = Date.now();
        for (const item of defaults) {
          await this.prisma.configuredDepositWallet.create({
            data: {
              networkId: item.networkId,
              chain: item.chain,
              address: item.address,
              label: item.label,
              isActive: true,
              createdAt: BigInt(now),
              updatedAt: BigInt(now),
            },
          });
        }
        this.logger.log(` 已成功初始化预设 ${defaults.length} 个多链充值专属收款钱包`);
      } else {
        // 自动更新已有长标签为短格式 (如 EVM01, TRON01, SOL01)
        const existing = await this.prisma.configuredDepositWallet.findMany();
        for (const w of existing) {
          const curLabel = w.label || '';
          let newLabel = curLabel;
          if (curLabel.includes('以太坊') && curLabel.includes('A1')) newLabel = 'EVM01';
          else if (curLabel.includes('以太坊') && curLabel.includes('A2')) newLabel = 'EVM02';
          else if (curLabel.includes('BSC') || curLabel.includes('B1')) newLabel = 'EVM03';
          else if (curLabel.includes('TRON') || curLabel.includes('波场')) newLabel = 'TRON01';
          else if (curLabel.includes('Solana') || curLabel.includes('S1')) newLabel = 'SOL01';

          if (newLabel !== curLabel) {
            await this.prisma.configuredDepositWallet.update({
              where: { id: w.id },
              data: { label: newLabel },
            });
            this.logger.log(`[Admin] 充值收款钱包标签已优化为短格式: ${curLabel} -> ${newLabel}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`初始化默认充值钱包池异常: ${err.message}`);
    }
  }

  /**
   * 查询所有配置的充值收款钱包 (支持按三大生态 chain: EVM/SOLANA/TRON 或具体 networkId 过滤)
   */
  async listWallets(query?: { chain?: string; networkId?: string } | string): Promise<DepositWalletEntity[]> {
    let chainFilter: string | undefined;
    let netFilter: string | undefined;

    if (typeof query === 'string') {
      // 兼容旧接口传 networkId 或 chain
      if (['EVM', 'SOLANA', 'TRON'].includes(query.toUpperCase())) {
        chainFilter = query.toUpperCase();
      } else {
        netFilter = query;
      }
    } else if (query) {
      chainFilter = query.chain?.toUpperCase();
      netFilter = query.networkId;
    }

    if (this.prisma) {
      try {
        const where: any = {};
        if (chainFilter) {
          where.chain = chainFilter;
        } else if (netFilter) {
          try {
            const net = this.networkRegistryService.getNetwork(netFilter);
            where.chain = net.family;
          } catch {
            where.networkId = netFilter;
          }
        }

        const list = await this.prisma.configuredDepositWallet.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
        return list.map((w) => ({
          id: w.id,
          networkId: w.networkId,
          chain: w.chain,
          address: w.address,
          label: w.label,
          isActive: w.isActive,
          createdAt: Number(w.createdAt),
          updatedAt: Number(w.updatedAt),
        }));
      } catch (err: any) {
        this.logger.warn(`查询充值钱包列表失败: ${err.message}`);
      }
    }

    let results = this.memoryWallets;
    if (chainFilter) {
      results = results.filter((w) => w.chain.toUpperCase() === chainFilter);
    } else if (netFilter) {
      results = results.filter((w) => w.networkId === netFilter);
    }
    return results;
  }

  /**
   * 获取指定网络当前激活的充值收款钱包池 (EVM 链自动共享同一组 EVM 钱包地址)
   */
  async getActiveWallets(networkId: string): Promise<DepositWalletEntity[]> {
    let targetChain = 'EVM';
    try {
      const net = this.networkRegistryService.getNetwork(networkId);
      targetChain = net.family;
    } catch {
      if (networkId.toLowerCase().includes('tron')) targetChain = 'TRON';
      if (networkId.toLowerCase().includes('solana')) targetChain = 'SOLANA';
    }

    const all = await this.listWallets({ chain: targetChain });
    return all.filter((w) => w.isActive);
  }

  /**
   * 随机挑选一个指定网络处于激活状态的充值钱包 (EVM 链从统一 EVM 池随机挑选)
   */
  async getRandomActiveDepositWallet(networkId: string): Promise<DepositWalletEntity> {
    const actives = await this.getActiveWallets(networkId);
    if (actives.length === 0) {
      // 容错：如果数据库未配置，查询网络注册表
      let family = ChainType.EVM;
      let netName = networkId;
      try {
        const net = this.networkRegistryService.getNetwork(networkId);
        family = net.family;
        netName = net.name;
      } catch {
        if (networkId.toLowerCase().includes('tron')) family = ChainType.TRON;
        if (networkId.toLowerCase().includes('solana')) family = ChainType.SOLANA;
      }

      const fallbackAddr =
        family === ChainType.EVM
          ? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
          : family === ChainType.TRON
            ? 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT'
            : 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb';
      return {
        id: `fallback-${networkId}`,
        networkId,
        chain: family,
        address: fallbackAddr,
        label: `${netName} 默认充值通道`,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    const idx = Math.floor(Math.random() * actives.length);
    return actives[idx];
  }

  /**
   * 管理后台新增充值专属钱包 (按 EVM / SOLANA / TRON 分组录入)
   */
  async addWallet(dto: AddDepositWalletDto): Promise<DepositWalletEntity> {
    const cleanAddress = dto.address.trim();
    if (!cleanAddress) {
      throw new BadRequestException('钱包地址不能为空');
    }

    let targetChain = (dto.chain || '').toUpperCase();
    if (!targetChain && dto.networkId) {
      try {
        const net = this.networkRegistryService.getNetwork(dto.networkId);
        targetChain = net.family;
      } catch {
        targetChain = 'EVM';
      }
    }
    if (!['EVM', 'SOLANA', 'TRON'].includes(targetChain)) {
      targetChain = 'EVM';
    }

    // 格式校验
    if (targetChain === 'EVM') {
      if (!cleanAddress.startsWith('0x') || cleanAddress.length !== 42) {
        throw new BadRequestException('EVM 钱包地址格式不正确，必须为 0x 开头 42 位十六进制公钥');
      }
    } else if (targetChain === 'TRON') {
      if (!cleanAddress.startsWith('T') || cleanAddress.length !== 34) {
        throw new BadRequestException('TRON 钱包地址格式不正确，必须为 T 开头 34 位 Base58Check 地址');
      }
    } else if (targetChain === 'SOLANA') {
      if (cleanAddress.length < 32 || cleanAddress.length > 44) {
        throw new BadRequestException('Solana 钱包地址格式不正确，必须为 32-44 位 Base58 公钥');
      }
    }

    const now = Date.now();
    if (this.prisma) {
      const existing = await this.prisma.configuredDepositWallet.findUnique({
        where: {
          chain_address: {
            chain: targetChain,
            address: cleanAddress,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `生态 [${targetChain}] 下已存在相同的充值收款钱包地址: ${cleanAddress}`,
        );
      }

      const created = await this.prisma.configuredDepositWallet.create({
        data: {
          networkId: dto.networkId || (targetChain === 'EVM' ? 'evm-shared' : targetChain.toLowerCase()),
          chain: targetChain,
          address: cleanAddress,
          label: dto.label || `${targetChain} 充值金库钱包`,
          isActive: true,
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });

      this.logger.log(`[Admin] 新增充值钱包: [${targetChain}] ${cleanAddress}`);
      return {
        id: created.id,
        networkId: created.networkId,
        chain: created.chain,
        address: created.address,
        label: created.label,
        isActive: created.isActive,
        createdAt: Number(created.createdAt),
        updatedAt: Number(created.updatedAt),
      };
    }

    const entity: DepositWalletEntity = {
      id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`,
      networkId: dto.networkId || targetChain.toLowerCase(),
      chain: targetChain,
      address: cleanAddress,
      label: dto.label || `${targetChain} 充值金库钱包`,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.memoryWallets.push(entity);
    return entity;
  }

  /**
   * 切换充值钱包的激活状态 (开启/暂停该收款地址)
   */
  async toggleActive(id: string, isActive?: boolean): Promise<DepositWalletEntity> {
    if (this.prisma) {
      const target = await this.prisma.configuredDepositWallet.findUnique({
        where: { id },
      });
      if (!target) throw new NotFoundException(`充值钱包配置 ${id} 不存在`);

      const nextStatus = isActive !== undefined ? isActive : !target.isActive;
      const updated = await this.prisma.configuredDepositWallet.update({
        where: { id },
        data: {
          isActive: nextStatus,
          updatedAt: BigInt(Date.now()),
        },
      });

      this.logger.log(`[Admin] 充值钱包状态切换: [${updated.address}] -> ${nextStatus ? 'ACTIVE' : 'INACTIVE'}`);
      return {
        id: updated.id,
        networkId: updated.networkId,
        chain: updated.chain,
        address: updated.address,
        label: updated.label,
        isActive: updated.isActive,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt),
      };
    }

    const item = this.memoryWallets.find((w) => w.id === id);
    if (!item) throw new NotFoundException(`充值钱包配置 ${id} 不存在`);
    item.isActive = isActive !== undefined ? isActive : !item.isActive;
    item.updatedAt = Date.now();
    return item;
  }

  /**
   * 更新充值专属收款钱包配置 (支持修改 label, isActive)
   */
  async updateWallet(
    id: string,
    dto: { label?: string; isActive?: boolean },
  ): Promise<DepositWalletEntity> {
    if (this.prisma) {
      const target = await this.prisma.configuredDepositWallet.findUnique({ where: { id } });
      if (!target) throw new NotFoundException(`充值钱包配置 ${id} 不存在`);

      const updated = await this.prisma.configuredDepositWallet.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? dto.label.trim() : target.label,
          isActive: dto.isActive !== undefined ? dto.isActive : target.isActive,
          updatedAt: BigInt(Date.now()),
        },
      });

      this.logger.log(`[Admin] 充值收款钱包已更新: [${updated.address}] label=${updated.label}`);
      return {
        id: updated.id,
        networkId: updated.networkId,
        chain: updated.chain,
        address: updated.address,
        label: updated.label,
        isActive: updated.isActive,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt),
      };
    }

    const item = this.memoryWallets.find((w) => w.id === id);
    if (!item) throw new NotFoundException(`充值钱包配置 ${id} 不存在`);
    if (dto.label !== undefined) item.label = dto.label.trim();
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    item.updatedAt = Date.now();
    return item;
  }

  /**
   * 删除指定的充值钱包
   */
  async deleteWallet(id: string): Promise<boolean> {
    if (this.prisma) {
      await this.prisma.configuredDepositWallet.delete({ where: { id } });
      this.logger.log(`[Admin] 删除充值钱包: ID=${id}`);
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
