import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { WithdrawWalletService } from './withdraw-wallet.service.js';
import type { AddWithdrawWalletDto } from './withdraw-wallet.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Withdraw Wallets - 提现出金热钱包配置 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/withdraw-wallets')
export class WithdrawWalletAdminController {
  constructor(private readonly withdrawWalletService: WithdrawWalletService) {}

  @ApiOperation({
    summary: '查询多链提现出金热钱包列表 (按 EVM, SOLANA, TRON 分组)',
    description: '【管理后台专属】获取各个公链生态配置的提现出金钱包。系统将在处理用户提现时自动调用对应热钱包放款。',
  })
  @ApiQuery({ name: 'chain', required: false, description: '可选生态大类过滤: EVM / SOLANA / TRON' })
  @Get()
  async listWallets(@Query('chain') chain?: string) {
    return this.withdrawWalletService.listWallets(chain);
  }

  @ApiOperation({
    summary: '新增提现出金热钱包 (EVM / SOLANA / TRON)',
    description: '【管理后台专属】录入新的出资热钱包地址及每日限额配置。',
  })
  @Post()
  async addWallet(@Body() dto: AddWithdrawWalletDto) {
    return this.withdrawWalletService.addWallet(dto);
  }

  @ApiOperation({
    summary: '更新提现出金热钱包配置 (修改备注标签、储备余额、单日限额等)',
  })
  @Put(':id')
  async updateWallet(
    @Param('id') id: string,
    @Body() dto: { label?: string; balance?: string; dailyLimit?: string; isActive?: boolean },
  ) {
    return this.withdrawWalletService.updateWallet(id, dto);
  }

  @ApiOperation({
    summary: '切换提现热钱包的激活状态 (开启/暂停放款)',
  })
  @Patch(':id/toggle')
  async toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive?: boolean,
  ) {
    return this.withdrawWalletService.toggleActive(id, isActive);
  }

  @ApiOperation({
    summary: '删除指定的提现钱包配置',
  })
  @Delete(':id')
  async deleteWallet(@Param('id') id: string) {
    return { success: await this.withdrawWalletService.deleteWallet(id) };
  }
}
