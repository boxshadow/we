import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TokenConfigService } from './token-config.service.js';

@ApiTags('Tokens - 公开代币查询')
@Controller('tokens')
export class TokenPublicController {
  constructor(private readonly tokenConfigService: TokenConfigService) {}

  @ApiOperation({
    summary: '查询公链支持的充值代币列表 (Public for DApp)',
    description: '供 DApp 充值界面展示用户可选的代币列表（仅返回处于 ACTIVE 激活状态的代币）。',
  })
  @ApiQuery({ name: 'networkId', required: false, description: '网络标识 (如 ethereum, bsc, tron, solana)' })
  @Get('supported')
  async getSupportedTokens(@Query('networkId') networkId?: string) {
    return this.tokenConfigService.listTokens(networkId, true);
  }
}
