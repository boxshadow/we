import { Controller, Post, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { TokenService } from './token.service.js';
import { TokenDeployDto } from '../../common/types/common.types.js';
import type { TxResult } from '../../common/types/common.types.js';

@ApiTags('Token - 代币发行与部署 (Token Deploy)')
@Controller('token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @ApiOperation({
    summary: '发行并部署新代币 (Deploy Token)',
    description: '使用系统专属发币钱包 (TOKEN_DEPLOY) 在指定公链上部署全新代币合约（EVM ERC20 / Solana SPL Token / Tron TRC20），并铸造初始代币至接收人。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, bsc, solana, tron)' })
  @ApiResponse({ status: 201, description: '部署成功，返回交易哈希与新代币合约地址 tokenAddress' })
  @Post(':chain/deploy')
  async deployToken(
    @Param('chain') chain: string,
    @Body() dto: TokenDeployDto,
  ): Promise<{ txResult: TxResult; tokenAddress: string }> {
    return this.tokenService.deployToken(chain, dto);
  }
}
