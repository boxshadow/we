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
import { DepositWalletService } from './deposit-wallet.service.js';
import type { AddDepositWalletDto } from './deposit-wallet.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Deposit Wallets - 充值收款专属钱包配置 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/deposit-wallets')
export class DepositWalletAdminController {
  constructor(private readonly depositWalletService: DepositWalletService) {}

  @ApiOperation({
    summary: '查询多链充值收款专属钱包列表 (支持按 EVM, SOLANA, TRON 三大生态分组)',
    description: '【管理后台专属】获取配置的充值收款钱包。EVM 生态链共享同一组地址池，SOLANA 和 TRON 独立分组。',
  })
  @ApiQuery({ name: 'chain', required: false, description: '可选生态大类过滤 (EVM / SOLANA / TRON)' })
  @ApiQuery({ name: 'networkId', required: false, description: '可选特定网络标识过滤' })
  @Get()
  async listWallets(
    @Query('chain') chain?: string,
    @Query('networkId') networkId?: string,
  ) {
    return this.depositWalletService.listWallets({ chain, networkId });
  }

  @ApiOperation({
    summary: '为指定公链新增充值专属收款钱包',
    description: '【管理后台专属】录入新的充值专属收款地址。系统将在用户充值时从该网络激活的钱包池中自动分配。',
  })
  @Post()
  async addWallet(@Body() dto: AddDepositWalletDto) {
    return this.depositWalletService.addWallet(dto);
  }

  @ApiOperation({
    summary: '更新充值专属收款钱包配置 (修改备注标签等)',
  })
  @Put(':id')
  async updateWallet(
    @Param('id') id: string,
    @Body() dto: { label?: string; isActive?: boolean },
  ) {
    return this.depositWalletService.updateWallet(id, dto);
  }

  @ApiOperation({
    summary: '切换充值钱包的激活状态 (启用/禁用)',
  })
  @Patch(':id/toggle')
  async toggleActive(
    @Param('id') id: string,
    @Body('isActive') isActive?: boolean,
  ) {
    return this.depositWalletService.toggleActive(id, isActive);
  }

  @ApiOperation({
    summary: '删除指定的充值钱包配置',
  })
  @Delete(':id')
  async deleteWallet(@Param('id') id: string) {
    return { success: await this.depositWalletService.deleteWallet(id) };
  }
}
