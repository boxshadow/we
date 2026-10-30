import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { TokenConfigService } from './token-config.service.js';
import type {
  AddSupportedTokenDto,
  UpdateSupportedTokenDto,
} from './token-config.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Tokens - 多链支持代币字典配置 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/tokens')
export class TokenAdminController {
  constructor(private readonly tokenConfigService: TokenConfigService) {}

  @ApiOperation({
    summary: '查询所有支持的公链代币配置列表',
    description: '【管理后台专属】获取各个网络配置的支持代币，包括代币名称、符号、合约地址、精度、最小充值额等。',
  })
  @ApiQuery({ name: 'networkId', required: false, description: '可选网络标识过滤' })
  @Get()
  async listTokens(@Query('networkId') networkId?: string) {
    return this.tokenConfigService.listTokens(networkId);
  }

  @ApiOperation({
    summary: '为指定公链新增支持的代币 (Token)',
    description: '【管理后台专属】录入新的代币支持。配置合约地址后系统可在充值验签时严格匹配该合约。',
  })
  @Post()
  async addToken(@Body() dto: AddSupportedTokenDto) {
    return this.tokenConfigService.addToken(dto);
  }

  @ApiOperation({
    summary: '更新代币配置或启停状态',
  })
  @Patch(':id')
  async updateToken(
    @Param('id') id: string,
    @Body() dto: UpdateSupportedTokenDto,
  ) {
    return this.tokenConfigService.updateToken(id, dto);
  }

  @ApiOperation({
    summary: '删除代币配置',
  })
  @Delete(':id')
  async deleteToken(@Param('id') id: string) {
    return { success: await this.tokenConfigService.deleteToken(id) };
  }
}
