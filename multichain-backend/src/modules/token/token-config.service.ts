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
import { NetworkRegistryService } from '../network/network-registry.service.js';

export interface AddSupportedTokenDto {
  networkId: string;
  symbol: string;
  name: string;
  contractAddress?: string | null;
  decimals?: number;
  icon?: string;
  minDeposit?: string;
}

export interface UpdateSupportedTokenDto {
  name?: string;
  contractAddress?: string | null;
  decimals?: number;
  icon?: string;
  minDeposit?: string;
  isActive?: boolean;
}

export interface SupportedTokenEntity {
  id: string;
  networkId: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  decimals: number;
  icon: string | null;
  minDeposit: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

@Injectable()
export class TokenConfigService implements OnModuleInit {
  private readonly logger = new Logger(TokenConfigService.name);

  // 内存备用列表
  private memoryTokens: SupportedTokenEntity[] = [];

  constructor(
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      await this.initDefaultTokens();
    }
  }

  /**
   * 初始化常用主流公链与代币配置（若为空自动填充）
   */
  async initDefaultTokens() {
    if (!this.prisma) return;
    try {
      const count = await this.prisma.supportedToken.count();
      if (count === 0) {
        this.logger.log(' 正在预设多链支持代币标准字典表...');
        const defaults = [
          // 1. Ethereum
          {
            networkId: 'ethereum',
            symbol: 'ETH',
            name: 'Ether (Native)',
            contractAddress: null,
            decimals: 18,
            minDeposit: '0.01',
          },
          {
            networkId: 'ethereum',
            symbol: 'USDT',
            name: 'Tether USD (ERC20)',
            contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            decimals: 6,
            minDeposit: '1.0',
          },
          {
            networkId: 'ethereum',
            symbol: 'USDC',
            name: 'USD Coin (ERC20)',
            contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            decimals: 6,
            minDeposit: '1.0',
          },

          // 2. BSC
          {
            networkId: 'bsc',
            symbol: 'BNB',
            name: 'BNB (Native)',
            contractAddress: null,
            decimals: 18,
            minDeposit: '0.01',
          },
          {
            networkId: 'bsc',
            symbol: 'USDT',
            name: 'Binance-Peg BSC-USD (BEP20)',
            contractAddress: '0x55d398326f99059fF775485246999027B3197955',
            decimals: 18,
            minDeposit: '1.0',
          },

          // 3. TRON
          {
            networkId: 'tron',
            symbol: 'TRX',
            name: 'TRON (Native)',
            contractAddress: null,
            decimals: 6,
            minDeposit: '10.0',
          },
          {
            networkId: 'tron',
            symbol: 'USDT',
            name: 'Tether USD (TRC20)',
            contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            decimals: 6,
            minDeposit: '1.0',
          },

          // 4. Solana
          {
            networkId: 'solana',
            symbol: 'SOL',
            name: 'Solana (Native)',
            contractAddress: null,
            decimals: 9,
            minDeposit: '0.05',
          },
          {
            networkId: 'solana',
            symbol: 'USDT',
            name: 'Tether USD (SPL)',
            contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            decimals: 6,
            minDeposit: '1.0',
          },
        ];

        const now = Date.now();
        for (const t of defaults) {
          await this.prisma.supportedToken.create({
            data: {
              networkId: t.networkId,
              symbol: t.symbol,
              name: t.name,
              contractAddress: t.contractAddress,
              decimals: t.decimals,
              minDeposit: t.minDeposit,
              isActive: true,
              createdAt: BigInt(now),
              updatedAt: BigInt(now),
            },
          });
        }
        this.logger.log(` 已成功初始化预设 ${defaults.length} 个多链支持代币配置`);
      }
    } catch (err: any) {
      this.logger.warn(`初始化支持代币配置异常: ${err.message}`);
    }
  }

  /**
   * 查询指定网络支持的代币列表
   */
  async listTokens(networkId?: string, onlyActive = false): Promise<SupportedTokenEntity[]> {
    if (this.prisma) {
      try {
        const where: any = {};
        if (networkId) where.networkId = networkId;
        if (onlyActive) where.isActive = true;

        const list = await this.prisma.supportedToken.findMany({
          where,
          orderBy: { symbol: 'asc' },
        });

        return list.map((t) => ({
          id: t.id,
          networkId: t.networkId,
          symbol: t.symbol,
          name: t.name,
          contractAddress: t.contractAddress,
          decimals: t.decimals,
          icon: t.icon,
          minDeposit: t.minDeposit,
          isActive: t.isActive,
          createdAt: Number(t.createdAt),
          updatedAt: Number(t.updatedAt),
        }));
      } catch (err: any) {
        this.logger.warn(`查询支持代币配置失败: ${err.message}`);
      }
    }

    let res = this.memoryTokens;
    if (networkId) res = res.filter((t) => t.networkId === networkId);
    if (onlyActive) res = res.filter((t) => t.isActive);
    return res;
  }

  /**
   * 获取指定网络与符号的 Token 配置
   */
  async findToken(networkId: string, symbol: string): Promise<SupportedTokenEntity | null> {
    if (this.prisma) {
      try {
        const t = await this.prisma.supportedToken.findUnique({
          where: {
            networkId_symbol: {
              networkId,
              symbol: symbol.toUpperCase(),
            },
          },
        });
        if (!t) return null;
        return {
          id: t.id,
          networkId: t.networkId,
          symbol: t.symbol,
          name: t.name,
          contractAddress: t.contractAddress,
          decimals: t.decimals,
          icon: t.icon,
          minDeposit: t.minDeposit,
          isActive: t.isActive,
          createdAt: Number(t.createdAt),
          updatedAt: Number(t.updatedAt),
        };
      } catch (err: any) {
        this.logger.warn(`查询单个代币配置失败: ${err.message}`);
      }
    }

    const item = this.memoryTokens.find(
      (t) => t.networkId === networkId && t.symbol === symbol.toUpperCase(),
    );
    return item || null;
  }

  /**
   * 管理后台新增支持代币配置
   */
  async addToken(dto: AddSupportedTokenDto): Promise<SupportedTokenEntity> {
    // 校验网络合法性
    this.networkRegistryService.getNetwork(dto.networkId);
    const cleanSymbol = dto.symbol.trim().toUpperCase();

    const cleanContract = dto.contractAddress
      ? dto.contractAddress.trim()
      : null;

    const now = Date.now();
    if (this.prisma) {
      const existing = await this.prisma.supportedToken.findUnique({
        where: {
          networkId_symbol: {
            networkId: dto.networkId,
            symbol: cleanSymbol,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `网络 [${dto.networkId}] 下已存在符号为 ${cleanSymbol} 的代币配置`,
        );
      }

      const created = await this.prisma.supportedToken.create({
        data: {
          networkId: dto.networkId,
          symbol: cleanSymbol,
          name: dto.name.trim(),
          contractAddress: cleanContract,
          decimals: dto.decimals !== undefined ? dto.decimals : 18,
          icon: dto.icon || null,
          minDeposit: dto.minDeposit || '0.01',
          isActive: true,
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });

      this.logger.log(`[Admin] 新增支持代币: [${dto.networkId}] ${cleanSymbol} (${dto.name})`);
      return {
        id: created.id,
        networkId: created.networkId,
        symbol: created.symbol,
        name: created.name,
        contractAddress: created.contractAddress,
        decimals: created.decimals,
        icon: created.icon,
        minDeposit: created.minDeposit,
        isActive: created.isActive,
        createdAt: Number(created.createdAt),
        updatedAt: Number(created.updatedAt),
      };
    }

    const existsMem = this.memoryTokens.some(
      (t) => t.networkId === dto.networkId && t.symbol === cleanSymbol,
    );
    if (existsMem) {
      throw new ConflictException(
        `网络 [${dto.networkId}] 下已存在符号为 ${cleanSymbol} 的代币配置`,
      );
    }

    const entity: SupportedTokenEntity = {
      id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`,
      networkId: dto.networkId,
      symbol: cleanSymbol,
      name: dto.name.trim(),
      contractAddress: cleanContract,
      decimals: dto.decimals !== undefined ? dto.decimals : 18,
      icon: dto.icon || null,
      minDeposit: dto.minDeposit || '0.01',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.memoryTokens.push(entity);
    return entity;
  }

  /**
   * 更新代币配置
   */
  async updateToken(id: string, dto: UpdateSupportedTokenDto): Promise<SupportedTokenEntity> {
    if (this.prisma) {
      const target = await this.prisma.supportedToken.findUnique({ where: { id } });
      if (!target) throw new NotFoundException(`代币配置 ${id} 不存在`);

      const updated = await this.prisma.supportedToken.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.contractAddress !== undefined ? { contractAddress: dto.contractAddress } : {}),
          ...(dto.decimals !== undefined ? { decimals: dto.decimals } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.minDeposit !== undefined ? { minDeposit: dto.minDeposit } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: BigInt(Date.now()),
        },
      });

      return {
        id: updated.id,
        networkId: updated.networkId,
        symbol: updated.symbol,
        name: updated.name,
        contractAddress: updated.contractAddress,
        decimals: updated.decimals,
        icon: updated.icon,
        minDeposit: updated.minDeposit,
        isActive: updated.isActive,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt),
      };
    }

    const item = this.memoryTokens.find((t) => t.id === id);
    if (!item) throw new NotFoundException(`代币配置 ${id} 不存在`);
    if (dto.name) item.name = dto.name;
    if (dto.contractAddress !== undefined) item.contractAddress = dto.contractAddress;
    if (dto.decimals !== undefined) item.decimals = dto.decimals;
    if (dto.minDeposit !== undefined) item.minDeposit = dto.minDeposit;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    item.updatedAt = Date.now();
    return item;
  }

  /**
   * 删除代币配置
   */
  async deleteToken(id: string): Promise<boolean> {
    if (this.prisma) {
      await this.prisma.supportedToken.delete({ where: { id } });
      this.logger.log(`[Admin] 删除代币配置: ID=${id}`);
      return true;
    }
    const idx = this.memoryTokens.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.memoryTokens.splice(idx, 1);
      return true;
    }
    return false;
  }
}
