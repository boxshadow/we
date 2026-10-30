import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { BalanceService } from '../balance/balance.service.js';
import { DepositService } from '../transfer/deposit.service.js';
import { WithdrawService } from '../transfer/withdraw.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import BigNumber from 'bignumber.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Users - 用户画像、多链绑定与资产明细 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/users')
export class UserAdminController {
  constructor(
    private readonly userService: UserService,
    @Optional() private readonly balanceService?: BalanceService,
    @Optional() private readonly depositService?: DepositService,
    @Optional() private readonly withdrawService?: WithdrawService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  @ApiOperation({
    summary: '获取全网用户列表 (支持搜索 ID/昵称/多链公钥、状态与角色筛选)',
    description: '【管理后台专属】分页查询平台主账号及其绑定的多链钱包总览。',
  })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词: 用户ID / 昵称 / 任意链公钥' })
  @ApiQuery({ name: 'role', required: false, description: '角色过滤: ALL | USER | ADMIN' })
  @ApiQuery({ name: 'status', required: false, description: '状态过滤: ALL | ACTIVE | BANNED' })
  @Get()
  async listUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    const allUsers = await this.userService.getAllUsers();
    let allBalances: any[] = [];
    if (this.balanceService) {
      try {
        allBalances = await this.balanceService.getAllBalances();
      } catch {}
    }

    // 预聚合用户总资产 (以 USDT 计)
    const userTotalAssets: Record<string, BigNumber> = {};
    for (const b of allBalances) {
      userTotalAssets[b.userId] = (userTotalAssets[b.userId] || new BigNumber(0)).plus(b.balance || '0');
    }

    let filtered = allUsers.map((u) => ({
      id: u.id,
      nickname: u.nickname || '未命名玩家',
      role: u.role,
      status: u.status,
      primaryWallet: u.primaryWallet,
      walletsCount: u.wallets ? u.wallets.length : 1,
      wallets: u.wallets || [],
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      totalBalanceUsdt: (userTotalAssets[u.id] || new BigNumber(0)).toFixed(2),
    }));

    if (role && role !== 'ALL') {
      filtered = filtered.filter((u) => u.role === role);
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((u) => u.status === status);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((u) => {
        if (u.id.toLowerCase().includes(q)) return true;
        if (u.nickname && u.nickname.toLowerCase().includes(q)) return true;
        if (u.primaryWallet?.address?.toLowerCase().includes(q)) return true;
        if (u.wallets && u.wallets.some((w) => w.address.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    filtered.sort((a, b) => b.createdAt - a.createdAt);

    return {
      total: filtered.length,
      list: filtered,
    };
  }

  @ApiOperation({
    summary: '获取指定用户的全维画像详情 (绑定钱包矩阵/多Token余额/充提历史)',
    description: '【管理后台专属】查看用户的多链身份公钥、各链各 Token 资产、充值订单流水与提现流水。',
  })
  @ApiParam({ name: 'userId', description: '用户主账号唯一 ID' })
  @Get(':userId/detail')
  async getUserDetail(@Param('userId') userId: string) {
    const user = await this.userService.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`未找到用户档案: ${userId}`);
    }

    // 1. 获取该用户多链资产余额矩阵
    let balances: any[] = [];
    if (this.balanceService) {
      try {
        balances = await this.balanceService.getUserBalances(userId);
      } catch {}
    }

    // 2. 获取该用户的充值历史
    let deposits: any[] = [];
    if (this.prisma) {
      try {
        const list = await this.prisma.depositOrder.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        deposits = list.map((d) => ({
          ...d,
          createdAt: Number(d.createdAt),
          expiresAt: Number(d.expiresAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : null,
        }));
      } catch {}
    } else if (this.depositService) {
      const allDep = await this.depositService.getRecentDeposits(200);
      deposits = allDep.filter((d) => d.userId === userId);
    }

    // 3. 获取该用户的提现历史
    let withdrawals: any[] = [];
    if (this.withdrawService) {
      try {
        withdrawals = await this.withdrawService.getUserWithdrawals(userId);
      } catch {}
    }

    // 4. 计算用户累计充值与提现量
    let totalDeposited = new BigNumber(0);
    for (const d of deposits) {
      if (d.status === 'CONFIRMED' || d.status === 'SUCCESS') {
        totalDeposited = totalDeposited.plus(d.actualAmount || d.amount || '0');
      }
    }

    let totalWithdrawn = new BigNumber(0);
    for (const w of withdrawals) {
      if (w.status === 'CONFIRMED') {
        totalWithdrawn = totalWithdrawn.plus(w.amount || '0');
      }
    }

    let totalAssetEstimate = new BigNumber(0);
    for (const b of balances) {
      totalAssetEstimate = totalAssetEstimate.plus(b.balance || '0');
    }

    return {
      profile: {
        id: user.id,
        nickname: user.nickname || '未命名玩家',
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        primaryWallet: user.primaryWallet,
      },
      wallets: user.wallets || [],
      balances,
      deposits,
      withdrawals,
      statistics: {
        totalAssetEstimate: totalAssetEstimate.toFixed(2),
        totalDeposited: totalDeposited.toFixed(2),
        totalWithdrawn: totalWithdrawn.toFixed(2),
        depositCount: deposits.length,
        withdrawalCount: withdrawals.length,
      },
    };
  }
}
