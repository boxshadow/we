import { Controller, Post, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { LockService } from './lock.service.js';
import { LockDto, UnlockDto } from '../../common/types/common.types.js';
import type { TxResult } from '../../common/types/common.types.js';

@ApiTags('Lock - 锁仓与解锁仓/池 (Lock & Unlock)')
@Controller('lock')
export class LockController {
  constructor(private readonly lockService: LockService) {}

  @ApiOperation({
    summary: '锁仓代币或 LP 凭证',
    description: '将项目方代币或流动性池 LP 凭证锁定在 Locker 合约中，指定锁定期与解锁受益人。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, bsc, solana, tron)' })
  @ApiResponse({ status: 200, description: '锁仓成功，返回交易哈希' })
  @Post(':chain')
  async lockToken(
    @Param('chain') chain: string,
    @Body() dto: LockDto,
  ): Promise<TxResult> {
    return this.lockService.lockToken(chain, dto);
  }

  @ApiOperation({
    summary: '显式锁仓路径 (Lock Token Explicit)',
    description: '显式路径锁仓接口，功能同 POST /api/lock/:chain。',
  })
  @ApiParam({ name: 'chain', description: '公链标识' })
  @ApiResponse({ status: 200, description: '锁仓成功' })
  @Post(':chain/lock')
  async lockTokenExplicit(
    @Param('chain') chain: string,
    @Body() dto: LockDto,
  ): Promise<TxResult> {
    return this.lockService.lockToken(chain, dto);
  }

  @ApiOperation({
    summary: '提取并解锁代币或 LP 池 (Unlock Token / Pool)',
    description: '当锁仓达到 unlockTimestamp 到期后，向 Locker 合约申请提取解锁已释放的代币或 LP 资产归还给受益人。',
  })
  @ApiParam({ name: 'chain', description: '公链标识' })
  @ApiResponse({ status: 200, description: '解锁成功，返回交易哈希' })
  @ApiResponse({ status: 400, description: '锁仓尚未到期或受益人不匹配' })
  @Post(':chain/unlock')
  async unlockToken(
    @Param('chain') chain: string,
    @Body() dto: UnlockDto,
  ): Promise<TxResult> {
    return this.lockService.unlockToken(chain, dto);
  }
}
