import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import {
  UserEntity,
  UserRole,
  UserStatus,
  BoundWallet,
} from './entities/user.entity.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  // User store with JSON persistence (data/users.json) as snapshot/backup
  private readonly storageFilePath = path.join(process.cwd(), 'data', 'users.json');
  private readonly usersById = new Map<string, UserEntity>();
  // Wallet lookup index: `${chain}:${address.toLowerCase()}` -> userId
  private readonly walletIndex = new Map<string, string>();

  constructor(@Optional() private readonly prisma?: PrismaService) {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      this.loadFromDisk();
    }
  }

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      await this.syncWithPrisma();
    }
  }

  /**
   * 将 Prisma 关系型数据库与内存索引双向同步
   */
  private async syncWithPrisma() {
    if (!this.prisma) return;
    try {
      const dbUsers = await this.prisma.user.findMany({
        include: { wallets: true },
      });

      if (dbUsers.length > 0) {
        this.usersById.clear();
        this.walletIndex.clear();

        for (const u of dbUsers) {
          const entity: UserEntity = {
            id: u.id,
            role: u.role as UserRole,
            status: u.status as UserStatus,
            nickname: u.nickname || undefined,
            avatar: u.avatar || undefined,
            primaryWallet: {
              chain: u.primaryChain as ChainType,
              address: u.primaryAddress,
            },
            wallets: u.wallets.map((w) => ({
              chain: w.chain as ChainType,
              address: w.address,
              networkId: w.networkId || undefined,
              isPrimary: w.isPrimary,
              boundAt: Number(w.boundAt),
            })),
            createdAt: Number(u.createdAt),
            updatedAt: Number(u.updatedAt),
            lastLoginAt: Number(u.lastLoginAt),
          };

          this.usersById.set(entity.id, entity);
          for (const w of entity.wallets) {
            this.walletIndex.set(this.getWalletKey(w.chain, w.address), entity.id);
          }
        }

        this.saveToDisk();
        this.logger.log(` [Prisma ORM] 成功从数据库同步 ${dbUsers.length} 个多链主账号档案与 ${this.walletIndex.size} 条跨链地址索引`);
      } else if (this.usersById.size > 0) {
        // 若 Prisma 库为空，但本地有 json 数据，则自动灌入 Prisma
        this.logger.log(` [Prisma ORM] 数据库为空，正在将本地 ${this.usersById.size} 个主账号灌入数据库...`);
        for (const user of this.usersById.values()) {
          await this.persistUserToPrisma(user);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Prisma 数据库初始化同步异常: ${err.message}`);
    }
  }

  private async persistUserToPrisma(user: UserEntity) {
    if (!this.prisma) return;
    try {
      await this.prisma.user.upsert({
        where: { id: user.id },
        update: {
          role: user.role,
          status: user.status,
          nickname: user.nickname,
          avatar: user.avatar,
          primaryChain: user.primaryWallet.chain,
          primaryAddress: user.primaryWallet.address,
          updatedAt: BigInt(user.updatedAt),
          lastLoginAt: BigInt(user.lastLoginAt),
        },
        create: {
          id: user.id,
          role: user.role,
          status: user.status,
          nickname: user.nickname,
          avatar: user.avatar,
          primaryChain: user.primaryWallet.chain,
          primaryAddress: user.primaryWallet.address,
          createdAt: BigInt(user.createdAt),
          updatedAt: BigInt(user.updatedAt),
          lastLoginAt: BigInt(user.lastLoginAt),
        },
      });

      for (const w of user.wallets) {
        const cleanAddr = w.address.trim().toLowerCase();
        await this.prisma.boundWallet.upsert({
          where: {
            chain_address: {
              chain: w.chain,
              address: cleanAddr,
            },
          },
          update: {
            networkId: w.networkId,
            isPrimary: !!w.isPrimary,
            boundAt: BigInt(w.boundAt),
          },
          create: {
            userId: user.id,
            chain: w.chain,
            address: cleanAddr,
            networkId: w.networkId,
            isPrimary: !!w.isPrimary,
            boundAt: BigInt(w.boundAt),
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Prisma 持久化用户 ${user.id} 失败: ${err.message}`);
    }
  }

  public reloadFromDisk() {
    this.usersById.clear();
    this.walletIndex.clear();
    this.loadFromDisk();
    return this.getAllUsers();
  }

  public resetDatabase() {
    this.usersById.clear();
    this.walletIndex.clear();
    this.saveToDisk();
    if (this.prisma) {
      this.prisma.boundWallet.deleteMany().catch(() => {});
      this.prisma.user.deleteMany().catch(() => {});
    }
    this.logger.log(` 数据库已重置清空: ${this.storageFilePath}`);
    return [];
  }

  private loadFromDisk() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const list: UserEntity[] = JSON.parse(raw);
        for (const user of list) {
          this.usersById.set(user.id, user);
          for (const w of user.wallets) {
            this.walletIndex.set(this.getWalletKey(w.chain, w.address), user.id);
          }
        }
        this.logger.log(` 已从本地持久化存储加载 ${list.length} 个主账号档案: ${this.storageFilePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`加载本地用户存储异常: ${err.message}`);
    }
  }

  private saveToDisk() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return;
    }
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.usersById.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.warn(`保存用户至本地存储失败: ${err.message}`);
    }
  }

  private getWalletKey(chain: ChainType, address: string): string {
    return `${chain}:${address.trim().toLowerCase()}`;
  }

  async findUserById(userId: string): Promise<UserEntity | null> {
    return this.usersById.get(userId) || null;
  }

  /**
   * 通过任意绑定的多链钱包地址查找用户主账户
   */
  async findUserByWallet(
    chain: ChainType,
    address: string,
  ): Promise<UserEntity | null> {
    const key = this.getWalletKey(chain, address);
    const userId = this.walletIndex.get(key);
    if (!userId) {
      return null;
    }
    return this.findUserById(userId);
  }

  /**
   * 首次登录：创建新用户并绑定初始钱包
   */
  async createUserWithWallet(
    chain: ChainType,
    address: string,
    networkId?: string,
  ): Promise<UserEntity> {
    const key = this.getWalletKey(chain, address);
    if (this.walletIndex.has(key)) {
      throw new ConflictException(
        `Wallet ${address} on ${chain} is already associated with an account.`,
      );
    }

    const userId = randomUUID();
    const now = Date.now();
    const cleanAddress = address.trim();

    const initialWallet: BoundWallet = {
      chain,
      address: cleanAddress,
      boundAt: now,
      networkId,
      isPrimary: true,
    };

    const user: UserEntity = {
      id: userId,
      primaryWallet: {
        chain,
        address: cleanAddress,
      },
      wallets: [initialWallet],
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      nickname: `User_${cleanAddress.slice(0, 6)}...${cleanAddress.slice(-4)}`,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    this.usersById.set(userId, user);
    this.walletIndex.set(key, userId);
    this.saveToDisk();

    if (this.prisma) {
      this.persistUserToPrisma(user).catch((err) => {
        this.logger.warn(`Prisma 异步写入新用户失败: ${err.message}`);
      });
    }

    this.logger.log(
      `Created new master account [${userId}] with primary wallet: [${chain}] ${cleanAddress}`,
    );
    return user;
  }

  /**
   * 绑定新钱包到当前主账号（支持跨链，如已有 EVM，再绑定 Solana 或 Tron 钱包）
   */
  async bindWalletToUser(
    userId: string,
    chain: ChainType,
    address: string,
    networkId?: string,
  ): Promise<UserEntity> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const key = this.getWalletKey(chain, address);
    const existingUserId = this.walletIndex.get(key);

    if (existingUserId) {
      if (existingUserId === userId) {
        throw new BadRequestException(
          `This wallet [${chain}] ${address} is already bound to your account.`,
        );
      }
      throw new ConflictException(
        `This wallet [${chain}] ${address} is already bound to another master account.`,
      );
    }

    const cleanAddress = address.trim();
    const newWallet: BoundWallet = {
      chain,
      address: cleanAddress,
      boundAt: Date.now(),
      networkId,
      isPrimary: false,
    };

    user.wallets.push(newWallet);
    user.updatedAt = Date.now();

    this.walletIndex.set(key, userId);
    this.saveToDisk();

    if (this.prisma) {
      this.prisma.boundWallet.create({
        data: {
          userId,
          chain,
          address: cleanAddress.toLowerCase(),
          networkId,
          isPrimary: false,
          boundAt: BigInt(newWallet.boundAt),
        },
      }).catch((err) => {
        this.logger.warn(`Prisma 异步添加绑定钱包失败: ${err.message}`);
      });
    }

    this.logger.log(
      `Bound new wallet: [${chain}] ${cleanAddress} to master account [${userId}]. Total wallets: ${user.wallets.length}`,
    );
    return user;
  }

  /**
   * 解绑钱包（主钱包或仅存的一个钱包不可解绑）
   */
  async unbindWalletFromUser(
    userId: string,
    chain: ChainType,
    address: string,
  ): Promise<UserEntity> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.wallets.length <= 1) {
      throw new BadRequestException(
        `Cannot unbind the only remaining wallet from your account.`,
      );
    }

    const cleanAddress = address.trim().toLowerCase();
    const walletIndex = user.wallets.findIndex(
      (w) =>
        w.chain === chain && w.address.trim().toLowerCase() === cleanAddress,
    );

    if (walletIndex === -1) {
      throw new NotFoundException(
        `Wallet [${chain}] ${address} is not bound to your account.`,
      );
    }

    const targetWallet = user.wallets[walletIndex];
    if (targetWallet.isPrimary) {
      throw new BadRequestException(
        `Cannot unbind the primary wallet. Please switch primary wallet first.`,
      );
    }

    user.wallets.splice(walletIndex, 1);
    user.updatedAt = Date.now();

    const key = this.getWalletKey(chain, address);
    this.walletIndex.delete(key);
    this.saveToDisk();

    if (this.prisma) {
      this.prisma.boundWallet.deleteMany({
        where: {
          chain,
          address: cleanAddress,
        },
      }).catch((err) => {
        this.logger.warn(`Prisma 异步解绑钱包失败: ${err.message}`);
      });
    }

    this.logger.log(
      `Unbound wallet [${chain}] ${address} from master account [${userId}].`,
    );
    return user;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (user) {
      user.lastLoginAt = Date.now();
      user.updatedAt = Date.now();
      this.saveToDisk();

      if (this.prisma) {
        this.prisma.user.update({
          where: { id: userId },
          data: {
            lastLoginAt: BigInt(user.lastLoginAt),
            updatedAt: BigInt(user.updatedAt),
          },
        }).catch(() => {});
      }
    }
  }

  async getAllUsers(): Promise<UserEntity[]> {
    return Array.from(this.usersById.values());
  }
}
