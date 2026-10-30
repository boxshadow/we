import {
  Controller,
  Get,
  Query,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { DepositService } from './deposit.service.js';
import { WithdrawService } from './withdraw.service.js';
import { SweepService } from './sweep.service.js';
import { WithdrawWalletService } from '../wallet/withdraw-wallet.service.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';
import BigNumber from 'bignumber.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

export interface UnifiedTransactionItem {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'SWEEP';
  network: string;
  chain: string; // EVM, SOLANA, TRON
  tokenSymbol: string;
  amount: string;
  fromAddress: string;
  toAddress: string;
  txHash?: string;
  status: string;
  timestamp: number;
  userId?: string;
  blockNumber?: number;
  confirmations?: number;
}

@ApiTags('Admin Ledger & Analytics - 账本审计、多维筛选与运营分析 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/ledger')
export class LedgerAdminController {
  constructor(
    private readonly depositService: DepositService,
    private readonly withdrawService: WithdrawService,
    private readonly sweepService: SweepService,
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly withdrawWalletService?: WithdrawWalletService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private resolveChain(networkId?: string): string {
    if (!networkId) return 'EVM';
    try {
      const net = this.networkRegistryService.getNetwork(networkId);
      return net.family;
    } catch {
      const lower = networkId.toLowerCase();
      if (lower.includes('tron')) return 'TRON';
      if (lower.includes('solana')) return 'SOLANA';
      return 'EVM';
    }
  }

  @ApiOperation({
    summary: '查询全平台资金流水账本 (多维筛选: 类型/生态/代币/状态/关键词/时间)',
  })
  @ApiQuery({ name: 'type', required: false, description: '流水类型: ALL | DEPOSIT | WITHDRAWAL | SWEEP' })
  @ApiQuery({ name: 'chain', required: false, description: '公链生态: ALL | EVM | SOLANA | TRON' })
  @ApiQuery({ name: 'network', required: false, description: '特定网络标识' })
  @ApiQuery({ name: 'token', required: false, description: '代币代码' })
  @ApiQuery({ name: 'status', required: false, description: '状态' })
  @ApiQuery({ name: 'search', required: false, description: '模糊搜索' })
  @ApiQuery({ name: 'startDate', required: false, description: '起始时间戳毫秒' })
  @ApiQuery({ name: 'endDate', required: false, description: '截止时间戳毫秒' })
  @Get('transactions')
  async getTransactions(
    @Query('type') type?: string,
    @Query('chain') chain?: string,
    @Query('network') network?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = '100',
  ) {
    const items: UnifiedTransactionItem[] = [];

    // 1. 抓取充值订单
    if (!type || type === 'ALL' || type === 'DEPOSIT') {
      const deposits = await this.depositService.getRecentDeposits(200);
      for (const d of deposits as any[]) {
        const netId = d.network || d.chain || 'ethereum';
        items.push({
          id: d.id,
          type: 'DEPOSIT',
          network: netId,
          chain: this.resolveChain(netId),
          tokenSymbol: d.tokenSymbol || 'USDT',
          amount: d.actualAmount || d.amount,
          fromAddress: d.fromAddress || '未知充值方',
          toAddress: d.depositAddress,
          txHash: d.txHash || undefined,
          status: String(d.status),
          timestamp: d.confirmedAt || d.createdAt,
          userId: d.userId || undefined,
          blockNumber: d.blockNumber ? Number(d.blockNumber) : undefined,
          confirmations: d.confirmations || 0,
        });
      }
    }

    // 2. 抓取提现出金订单
    if (!type || type === 'ALL' || type === 'WITHDRAWAL') {
      const withdrawals = await this.withdrawService.getAllWithdrawals();
      for (const w of withdrawals as any[]) {
        const netId = w.network || w.chain || 'ethereum';
        items.push({
          id: w.id,
          type: 'WITHDRAWAL',
          network: netId,
          chain: this.resolveChain(netId),
          tokenSymbol: w.tokenSymbol || 'USDT',
          amount: w.amount,
          fromAddress: w.fromVault,
          toAddress: w.toAddress,
          txHash: w.txHash,
          status: String(w.status),
          timestamp: w.confirmedAt || w.createdAt,
          userId: w.userId || undefined,
          blockNumber: w.blockNumber ? Number(w.blockNumber) : undefined,
          confirmations: w.confirmations || 0,
        });
      }
    }

    // 3. 抓取自动归集记录
    if (!type || type === 'ALL' || type === 'SWEEP') {
      const sweeps = await this.sweepService.getSweepHistory(100);
      for (const s of sweeps as any[]) {
        const netId = String(s.network || 'ethereum');
        items.push({
          id: s.id || s.sweepId || `sweep-${s.timestamp}`,
          type: 'SWEEP',
          network: netId,
          chain: this.resolveChain(netId),
          tokenSymbol: s.tokenAddress ? 'TOKEN' : 'NATIVE',
          amount: s.amount,
          fromAddress: s.fromDepositWallet,
          toAddress: s.toTargetAddress,
          txHash: s.txHash,
          status: 'SUCCESS',
          timestamp: Number(s.timestamp),
        });
      }
    }

    // 过滤逻辑
    let filtered = items;

    if (chain && chain !== 'ALL') {
      filtered = filtered.filter((i) => i.chain.toUpperCase() === chain.toUpperCase());
    }

    if (network && network !== 'ALL') {
      filtered = filtered.filter((i) => i.network.toLowerCase() === network.toLowerCase());
    }

    if (token && token !== 'ALL') {
      filtered = filtered.filter((i) => i.tokenSymbol.toUpperCase() === token.toUpperCase());
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((i) => i.status.toUpperCase() === status.toUpperCase());
    }

    if (startDate) {
      const s = parseInt(startDate, 10);
      if (!isNaN(s)) filtered = filtered.filter((i) => i.timestamp >= s);
    }

    if (endDate) {
      const e = parseInt(endDate, 10);
      if (!isNaN(e)) filtered = filtered.filter((i) => i.timestamp <= e);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((i) =>
        i.id.toLowerCase().includes(q) ||
        (i.txHash && i.txHash.toLowerCase().includes(q)) ||
        (i.fromAddress && i.fromAddress.toLowerCase().includes(q)) ||
        (i.toAddress && i.toAddress.toLowerCase().includes(q)) ||
        (i.userId && i.userId.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    const max = parseInt(limit, 10) || 100;
    return {
      total: filtered.length,
      list: filtered.slice(0, max),
    };
  }

  @ApiOperation({
    summary: '查询充值记录 (支持生态/网络/代币/到账状态/关键词筛选)',
  })
  @Get('deposits')
  async getDeposits(
    @Query('chain') chain?: string,
    @Query('network') network?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
    @Query('credited') credited?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = '100',
  ) {
    const all = await this.depositService.getRecentDeposits(200);
    let filtered = (all as any[]).map((d) => {
      const netId = d.network || d.chain || 'ethereum';
      return {
        ...d,
        network: netId,
        chain: this.resolveChain(netId),
        tokenSymbol: d.tokenSymbol || 'USDT',
      };
    });

    if (chain && chain !== 'ALL') {
      filtered = filtered.filter((d) => d.chain.toUpperCase() === chain.toUpperCase());
    }

    if (network && network !== 'ALL') {
      filtered = filtered.filter((d) => d.network.toLowerCase() === network.toLowerCase());
    }

    if (token && token !== 'ALL') {
      filtered = filtered.filter((d) => (d.tokenSymbol || 'USDT').toUpperCase() === token.toUpperCase());
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((d) => String(d.status).toUpperCase() === status.toUpperCase());
    }

    if (credited !== undefined && credited !== '') {
      const c = credited === 'true';
      filtered = filtered.filter((d) => Boolean(d.credited) === c);
    }

    if (startDate) {
      const s = parseInt(startDate, 10);
      if (!isNaN(s)) filtered = filtered.filter((d) => (d.confirmedAt || d.createdAt) >= s);
    }

    if (endDate) {
      const e = parseInt(endDate, 10);
      if (!isNaN(e)) filtered = filtered.filter((d) => (d.confirmedAt || d.createdAt) <= e);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((d) =>
        d.id.toLowerCase().includes(q) ||
        (d.txHash && d.txHash.toLowerCase().includes(q)) ||
        (d.depositAddress && d.depositAddress.toLowerCase().includes(q)) ||
        (d.fromAddress && d.fromAddress.toLowerCase().includes(q)) ||
        (d.userId && d.userId.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => (b.confirmedAt || b.createdAt) - (a.confirmedAt || a.createdAt));
    const max = parseInt(limit, 10) || 100;
    return {
      total: filtered.length,
      list: filtered.slice(0, max),
    };
  }

  @ApiOperation({
    summary: '查询提现记录 (支持生态/网络/代币/状态/关键词筛选)',
  })
  @Get('withdrawals')
  async getWithdrawals(
    @Query('chain') chain?: string,
    @Query('network') network?: string,
    @Query('token') token?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = '100',
  ) {
    const all = await this.withdrawService.getAllWithdrawals();
    let filtered = (all as any[]).map((w) => {
      const netId = w.network || w.chain || 'ethereum';
      return {
        ...w,
        network: netId,
        chain: this.resolveChain(netId),
        tokenSymbol: w.tokenSymbol || 'USDT',
      };
    });

    if (chain && chain !== 'ALL') {
      filtered = filtered.filter((w) => w.chain.toUpperCase() === chain.toUpperCase());
    }

    if (network && network !== 'ALL') {
      filtered = filtered.filter((w) => w.network.toLowerCase() === network.toLowerCase());
    }

    if (token && token !== 'ALL') {
      filtered = filtered.filter((w) => (w.tokenSymbol || 'USDT').toUpperCase() === token.toUpperCase());
    }

    if (status && status !== 'ALL') {
      filtered = filtered.filter((w) => String(w.status).toUpperCase() === status.toUpperCase());
    }

    if (startDate) {
      const s = parseInt(startDate, 10);
      if (!isNaN(s)) filtered = filtered.filter((w) => (w.confirmedAt || w.createdAt) >= s);
    }

    if (endDate) {
      const e = parseInt(endDate, 10);
      if (!isNaN(e)) filtered = filtered.filter((w) => (w.confirmedAt || w.createdAt) <= e);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((w) =>
        w.id.toLowerCase().includes(q) ||
        (w.txHash && w.txHash.toLowerCase().includes(q)) ||
        (w.toAddress && w.toAddress.toLowerCase().includes(q)) ||
        (w.fromVault && w.fromVault.toLowerCase().includes(q)) ||
        (w.userId && w.userId.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => (b.confirmedAt || b.createdAt) - (a.confirmedAt || a.createdAt));
    const max = parseInt(limit, 10) || 100;
    return {
      total: filtered.length,
      list: filtered.slice(0, max),
    };
  }

  @ApiOperation({
    summary: '运营可视化大屏核心统计看板 (Analytics & Operations Dashboard)',
  })
  @Get('analytics')
  async getAnalytics() {
    const deposits = (await this.depositService.getRecentDeposits(500)) as any[];
    const withdrawals = (await this.withdrawService.getAllWithdrawals()) as any[];

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const startOfToday = new Date().setHours(0, 0, 0, 0);

    let totalDepositUsdt = new BigNumber(0);
    let todayDepositUsdt = new BigNumber(0);
    let pendingDepositsCount = 0;

    for (const d of deposits) {
      const amt = new BigNumber(d.actualAmount || d.amount || '0');
      const st = String(d.status).toUpperCase();
      if (st === 'CONFIRMED' || st === 'SUCCESS') {
        totalDepositUsdt = totalDepositUsdt.plus(amt);
        if (d.confirmedAt && d.confirmedAt >= startOfToday) {
          todayDepositUsdt = todayDepositUsdt.plus(amt);
        }
      } else if (st === 'PENDING' || st === 'CONFIRMING' || st === 'SUBMITTED') {
        pendingDepositsCount++;
      }
    }

    let totalWithdrawalUsdt = new BigNumber(0);
    let todayWithdrawalUsdt = new BigNumber(0);
    let pendingWithdrawalsCount = 0;

    for (const w of withdrawals) {
      const amt = new BigNumber(w.amount || '0');
      const st = String(w.status).toUpperCase();
      if (st === 'CONFIRMED' || st === 'SUCCESS') {
        totalWithdrawalUsdt = totalWithdrawalUsdt.plus(amt);
        if (w.confirmedAt && w.confirmedAt >= startOfToday) {
          todayWithdrawalUsdt = todayWithdrawalUsdt.plus(amt);
        }
      } else if (st === 'PENDING' || st === 'PROCESSING') {
        pendingWithdrawalsCount++;
      }
    }

    let deposit24h = new BigNumber(0);
    for (const d of deposits) {
      if ((d.confirmedAt || d.createdAt) >= oneDayAgo) {
        deposit24h = deposit24h.plus(d.actualAmount || d.amount || '0');
      }
    }

    let withdraw24h = new BigNumber(0);
    for (const w of withdrawals) {
      if ((w.confirmedAt || w.createdAt) >= oneDayAgo) {
        withdraw24h = withdraw24h.plus(w.amount || '0');
      }
    }

    const netFlow24h = deposit24h.minus(withdraw24h).toFixed(2);

    const chainCounts = { EVM: 0, TRON: 0, SOLANA: 0 };
    for (const d of deposits) {
      const netId = d.network || d.chain || 'ethereum';
      const chain = this.resolveChain(netId) as keyof typeof chainCounts;
      if (chainCounts[chain] !== undefined) chainCounts[chain]++;
    }
    for (const w of withdrawals) {
      const netId = w.network || w.chain || 'ethereum';
      const chain = this.resolveChain(netId) as keyof typeof chainCounts;
      if (chainCounts[chain] !== undefined) chainCounts[chain]++;
    }

    const totalOrders = Math.max(1, deposits.length + withdrawals.length);
    const chainVolumeShare = {
      EVM: Math.round((chainCounts.EVM / totalOrders) * 100),
      TRON: Math.round((chainCounts.TRON / totalOrders) * 100),
      SOLANA: Math.round((chainCounts.SOLANA / totalOrders) * 100),
    };

    let vaultReserves = [
      {
        chain: 'EVM',
        address: '0x1111111111111111111111111111111111111111',
        balance: '250000.00',
        label: 'EVM01',
        status: 'NORMAL',
      },
      {
        chain: 'TRON',
        address: 't9yd14nj9j7xab4dbgeix9h8unkkhxuwwb',
        balance: '180000.00',
        label: 'TRON01',
        status: 'NORMAL',
      },
      {
        chain: 'SOLANA',
        address: 'solanaaddress111111111111111111111111111111',
        balance: '5000.00',
        label: 'SOL01',
        status: 'NORMAL',
      },
    ];

    if (this.withdrawWalletService) {
      try {
        const wallets = await this.withdrawWalletService.listWallets();
        if (wallets.length > 0) {
          vaultReserves = wallets.map((w) => ({
            chain: w.chain,
            address: w.address,
            balance: w.balance,
            label: w.label || `${w.chain}01`,
            status: parseFloat(w.balance) < 1000 ? 'WARN' : 'NORMAL',
          }));
        }
      } catch {}
    }

    // 统计过去 15 天完整的充值/提现运营数据 (15-Day Cashflow Analytics)
    const trend15Days: Array<{
      date: string;
      fullDate: string;
      depositAmount: number;
      depositCount: number;
      withdrawAmount: number;
      withdrawCount: number;
      netInflow: number;
    }> = [];

    let sum15dDeposit = new BigNumber(0);
    let sum15dWithdraw = new BigNumber(0);
    let sum15dDepositCount = 0;
    let sum15dWithdrawCount = 0;

    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fullDate = `${year}-${month}-${day}`;
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;

      const dayStart = new Date(d.setHours(0, 0, 0, 0)).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      let dayDep = new BigNumber(0);
      let dayDepCount = 0;
      for (const dep of deposits) {
        const t = dep.confirmedAt || dep.createdAt;
        if (t >= dayStart && t < dayEnd) {
          dayDep = dayDep.plus(dep.actualAmount || dep.amount || '0');
          dayDepCount++;
        }
      }

      let dayWd = new BigNumber(0);
      let dayWdCount = 0;
      for (const wd of withdrawals) {
        const t = wd.confirmedAt || wd.createdAt;
        if (t >= dayStart && t < dayEnd) {
          dayWd = dayWd.plus(wd.amount || '0');
          dayWdCount++;
        }
      }

      const depVal = parseFloat(dayDep.toFixed(2));
      const wdVal = parseFloat(dayWd.toFixed(2));
      const netVal = parseFloat(dayDep.minus(dayWd).toFixed(2));

      sum15dDeposit = sum15dDeposit.plus(dayDep);
      sum15dWithdraw = sum15dWithdraw.plus(dayWd);
      sum15dDepositCount += dayDepCount;
      sum15dWithdrawCount += dayWdCount;

      trend15Days.push({
        date: dateStr,
        fullDate,
        depositAmount: depVal,
        depositCount: dayDepCount,
        withdrawAmount: wdVal,
        withdrawCount: dayWdCount,
        netInflow: netVal,
      });
    }

    const summary15Days = {
      totalDepositAmount: sum15dDeposit.toFixed(2),
      totalWithdrawAmount: sum15dWithdraw.toFixed(2),
      totalNetInflow: sum15dDeposit.minus(sum15dWithdraw).toFixed(2),
      totalDepositCount: sum15dDepositCount,
      totalWithdrawCount: sum15dWithdrawCount,
      totalCount: sum15dDepositCount + sum15dWithdrawCount,
    };

    return {
      summary: {
        totalDepositAmount: totalDepositUsdt.toFixed(2),
        todayDepositAmount: todayDepositUsdt.toFixed(2),
        totalDepositCount: deposits.length,
        totalWithdrawalAmount: totalWithdrawalUsdt.toFixed(2),
        todayWithdrawalAmount: todayWithdrawalUsdt.toFixed(2),
        totalWithdrawalCount: withdrawals.length,
        netFlow24h,
        pendingDepositsCount,
        pendingWithdrawalsCount,
      },
      chainVolumeShare,
      vaultReserves,
      recentTrend: trend15Days,
      trend15Days,
      summary15Days,
    };
  }
}
