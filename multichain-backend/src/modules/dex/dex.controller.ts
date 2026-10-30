import { Controller, Post, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { DexService } from './dex.service.js';
import {
  AddLiquidityDto,
  RemoveLiquidityDto,
  SwapDto,
} from '../../common/types/common.types.js';
import type { TxResult } from '../../common/types/common.types.js';

@ApiTags('DEX - 去中心化交易所与流动性 (Liquidity & Swap)')
@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @ApiOperation({
    summary: '添加流动性 (Add Liquidity)',
    description: '向指定 DEX 流动性池注入双边代币对，并向接收人铸造 LP 凭证。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, bsc, solana, tron)' })
  @ApiResponse({ status: 200, description: '添加流动性成功，返回交易哈希' })
  @Post(':chain/liquidity/add')
  async addLiquidity(
    @Param('chain') chain: string,
    @Body() dto: AddLiquidityDto,
  ): Promise<TxResult> {
    return this.dexService.addLiquidity(chain, dto);
  }

  @ApiOperation({
    summary: '移除流动性 (Remove Liquidity)',
    description: '销毁指定数量的 LP 凭证，赎回流动性池中的底层代币对。',
  })
  @ApiParam({ name: 'chain', description: '公链标识' })
  @ApiResponse({ status: 200, description: '移除流动性成功，返回交易哈希' })
  @Post(':chain/liquidity/remove')
  async removeLiquidity(
    @Param('chain') chain: string,
    @Body() dto: RemoveLiquidityDto,
  ): Promise<TxResult> {
    return this.dexService.removeLiquidity(chain, dto);
  }

  @ApiOperation({
    summary: 'DEX 资产兑换/买卖 (Swap Tokens)',
    description: '在 DEX 上执行代币兑换（如 USDT 换代币或代币换原生币），支持最小输出量滑点保护。',
  })
  @ApiParam({ name: 'chain', description: '公链标识' })
  @ApiResponse({ status: 200, description: '兑换成功，返回交易哈希' })
  @Post(':chain/swap')
  async swap(
    @Param('chain') chain: string,
    @Body() dto: SwapDto,
  ): Promise<TxResult> {
    return this.dexService.swap(chain, dto);
  }
}
