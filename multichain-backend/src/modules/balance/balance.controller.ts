import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { BalanceService } from './balance.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Balances - 多链代币资产余额中心')
@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @ApiOperation({
    summary: '查询指定用户在各链各 Token 的余额矩阵 (Public / DApp)',
    description: '获取用户账户名下各个公链、各个 Token (USDT, USDC, 原生代币等) 的独立余额。',
  })
  @Get('user/:userId')
  async getUserBalances(@Param('userId') userId: string) {
    return this.balanceService.getUserBalances(userId);
  }

  @ApiOperation({
    summary: '查询用户在特定公链上的特定代币余额',
  })
  @Get('user/:userId/:networkId/:symbol')
  async getSingleBalance(
    @Param('userId') userId: string,
    @Param('networkId') networkId: string,
    @Param('symbol') symbol: string,
  ) {
    const balance = await this.balanceService.getSingleBalance(
      userId,
      networkId,
      symbol,
    );
    return { userId, networkId, symbol: symbol.toUpperCase(), balance };
  }

  @ApiOperation({
    summary: '【管理后台】查询全网所有用户代币资产余额一览 (Admin Only)',
  })
  @ApiBearerAuth('JWT-Admin-Auth')
  @UseGuards(AdminJwtAuthGuard)
  @Get('admin/all')
  async getAllBalances() {
    return this.balanceService.getAllBalances();
  }
}
