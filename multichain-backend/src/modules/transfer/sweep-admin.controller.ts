import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SweepService, SweepDto } from './sweep.service.js';
import type { SweepResult } from './sweep.service.js';
import { AutoSweepCronService } from './auto-sweep-cron.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

/**
 * 管理后台专属控制器：充值资金归集
 * 严格限制在管理后台调用，绝不对前端 / 客户端开放
 */
@ApiTags('Admin Sweep - 管理后台专属充值资金归集 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/sweep')
export class SweepAdminController {
  constructor(
    private readonly sweepService: SweepService,
    private readonly autoSweepCronService: AutoSweepCronService,
  ) {}

  /**
   * 管理后台手动触发或定时任务触发资金归集
   * 将散落在 DEPOSIT 充值专属收款地址中的代币或原生币汇总划转至金库或出金热钱包
   */
  @ApiOperation({
    summary: '执行充值资金归集划转 (Sweep Funds)',
    description: '【管理后台专属】将沉淀在 DEPOSIT 专属收款地址中的代币或原生币汇总划转至冷金库或出金热钱包。受严格用途审计保护：源地址必须为 DEPOSIT 类型，若不是直接拒绝。',
  })
  @ApiResponse({ status: 200, description: '归集划转成功，返回归集单号与链上 txHash' })
  @ApiResponse({ status: 400, description: '源地址非充值钱包（安全违规）或余额不足' })
  @Post()
  async sweepFunds(@Body() dto: SweepDto): Promise<SweepResult> {
    return this.sweepService.sweepDepositFunds(dto);
  }

  /**
   * 管理后台查询指定充值地址的当前链上待归集余额及 DEPOSIT 身份审计状态
   */
  @ApiOperation({
    summary: '查询充值收款地址待归集余额及审计状态 (Sweepable Balance)',
    description: '【管理后台专属】审计指定充值钱包是否合法，并实时查询其当前链上沉淀的待归集余额。',
  })
  @ApiParam({ name: 'network', description: '网络标识符 (如 ethereum, bsc, solana, tron)' })
  @ApiParam({ name: 'address', description: '充值钱包公钥地址' })
  @ApiQuery({ name: 'tokenAddress', required: false, description: '代币地址 (留空查询原生币)' })
  @ApiResponse({ status: 200, description: '返回可归集余额及审计合规标记' })
  @Get('balance/:network/:address')
  async getSweepableBalance(
    @Param('network') network: string,
    @Param('address') address: string,
    @Query('tokenAddress') tokenAddress?: string,
  ) {
    return this.sweepService.getSweepableBalance(network, address, tokenAddress);
  }

  /**
   * 查询归集审计流水历史
   */
  @ApiOperation({
    summary: '查询归集审计流水历史 (Sweep History)',
    description: '【管理后台专属】获取持久化到 Prisma 数据库的链上归集划转记录。',
  })
  @Get('history')
  async getSweepHistory(@Query('limit') limit?: string) {
    const num = limit ? parseInt(limit, 10) : 50;
    return this.sweepService.getSweepHistory(num);
  }

  /**
   * 获取自动化归集定时任务运行状态
   */
  @ApiOperation({
    summary: '获取自动化归集定时任务状态 (Auto-Sweep Status)',
  })
  @Get('auto-status')
  getAutoSweepStatus() {
    return this.autoSweepCronService.getStatus();
  }

  /**
   * 切换自动化归集定时任务状态
   */
  @ApiOperation({
    summary: '切换自动化归集定时任务启用/暂停 (Toggle Auto-Sweep)',
  })
  @Post('auto-toggle')
  toggleAutoSweep(@Body('enabled') enabled?: boolean) {
    return this.autoSweepCronService.toggle(enabled);
  }
}
