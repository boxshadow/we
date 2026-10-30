import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { PriceService } from './price.service.js';
import type { PriceResult } from '../../common/types/common.types.js';

@ApiTags('Price - 实时行情与价格监控 (Token Price)')
@Controller('price')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @ApiOperation({
    summary: '查询代币实时价格 (Get Token Price)',
    description: '通过链上流动性池 (DEX Reserves) 或多级报价缓存获取代币当前 USD 价格与计价币汇率。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, bsc, solana, tron)' })
  @ApiParam({ name: 'tokenAddress', description: '待查询代币合约地址' })
  @ApiQuery({ name: 'quoteTokenAddress', required: false, description: '计价代币合约地址 (默认 USDT/USDC)' })
  @ApiResponse({ status: 200, description: '返回代币最新价格数据' })
  @Get(':chain/:tokenAddress')
  async getPrice(
    @Param('chain') chain: string,
    @Param('tokenAddress') tokenAddress: string,
    @Query('quoteTokenAddress') quoteTokenAddress?: string,
  ): Promise<PriceResult> {
    return this.priceService.getPrice(
      chain,
      tokenAddress,
      quoteTokenAddress,
    );
  }
}
