import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { TransferService } from './transfer.service.js';
import { DepositService } from './deposit.service.js';
import { WithdrawService } from './withdraw.service.js';
import { TransferDto } from '../../common/types/common.types.js';
import type { TxResult, VerifyTxResult } from '../../common/types/common.types.js';
import {
  CreateDepositDto,
  SubmitDepositTxDto,
  ScanMatchDepositDto,
  CreateWithdrawDto,
} from './types/order.types.js';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Transfer - 充提与转账业务')
@Controller('transfer')
export class TransferController {
  constructor(
    private readonly transferService: TransferService,
    private readonly depositService: DepositService,
    private readonly withdrawService: WithdrawService,
    private readonly reconciliationService: WithdrawalReconciliationService,
    @Optional() private readonly jwtService?: JwtService,
  ) {}

  @ApiOperation({
    summary: '通用转账广播 (Transfer)',
    description: '在指定公链上广播转账原生币或代币。',
  })
  @ApiParam({ name: 'chain', description: '公链或网络标识 (如 ethereum, bsc, solana, tron)' })
  @ApiResponse({ status: 200, description: '广播成功返回交易哈希' })
  @Post(':chain')
  async transfer(
    @Param('chain') chain: string,
    @Body() dto: TransferDto,
  ): Promise<TxResult> {
    return this.transferService.transfer(chain, dto);
  }

  @ApiOperation({
    summary: '查询链上交易状态与确认回执 (Verify Tx)',
    description: '查询指定链上指定 txHash 的打包确认状态、区块高度及详细收据。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, solana, tron)' })
  @ApiParam({ name: 'txHash', description: '交易哈希' })
  @ApiResponse({ status: 200, description: '返回交易确认状态与收据' })
  @Get(':chain/verify/:txHash')
  async verifyTx(
    @Param('chain') chain: string,
    @Param('txHash') txHash: string,
  ): Promise<VerifyTxResult> {
    return this.transferService.verifyTx(chain, txHash);
  }

  @ApiOperation({
    summary: '查询链上地址余额 (Balance)',
    description: '查询指定账户地址的原生币余额或指定代币合约余额。',
  })
  @ApiParam({ name: 'chain', description: '公链标识 (如 ethereum, bsc, solana, tron)' })
  @ApiParam({ name: 'address', description: '目标钱包公钥地址' })
  @ApiQuery({ name: 'tokenAddress', required: false, description: '代币合约地址 (留空查询原生币)' })
  @ApiResponse({ status: 200, description: '返回地址与余额字符串' })
  @Get(':chain/balance/:address')
  async getBalance(
    @Param('chain') chain: string,
    @Param('address') address: string,
    @Query('tokenAddress') tokenAddress?: string,
  ): Promise<{ address: string; balance: string; tokenAddress?: string }> {
    const balance = await this.transferService.getBalance(
      chain,
      address,
      tokenAddress,
    );
    return { address, balance, tokenAddress };
  }

  // ==================== Public DApp Deposit & Withdraw Workflows ====================

  @ApiOperation({
    summary: '查询最近充值订单流水 (Recent Deposit Orders)',
    description: '获取最近的充值订单记录与确认状态。',
  })
  @Get('workflow/deposits')
  async getRecentDeposits(@Query('limit') limit?: string) {
    const num = limit ? parseInt(limit, 10) : 20;
    return this.depositService.getRecentDeposits(num);
  }

  @ApiOperation({
    summary: '创建充值订单意图 (Create Deposit Intent)',
    description: '用户在 DApp 发起充值，系统从专属 DEPOSIT 钱包池智能匹配一个收款地址 A，返回 30 分钟有效的充值订单。',
  })
  @ApiResponse({ status: 201, description: '充值订单创建成功，包含分配的收款地址 depositAddress' })
  @Post('workflow/deposit')
  async createDepositIntent(@Body() dto: CreateDepositDto) {
    return this.depositService.createDepositIntent(dto);
  }

  @ApiOperation({
    summary: '查询充值订单链上区块确认进度 (Deposit Progress)',
    description: '通过区块高度与当前确认数实时追踪充值交易的链上打包进度 (如 1/3, 2/3, 3/3 确认)。',
  })
  @ApiParam({ name: 'orderId', description: '充值订单 UUID' })
  @Get('workflow/deposit/:orderId/progress')
  async getDepositProgress(@Param('orderId') orderId: string) {
    return this.depositService.getDepositProgress(orderId);
  }

  @ApiOperation({
    summary: '确认充值交易 (Confirm Deposit Tx)',
    description: '用户完成转账后提交链上广播获得的 txHash，后端即刻进行链上验签、金额校验并防重放，确认后标记订单到账。',
  })
  @ApiResponse({ status: 200, description: '充值成功确认' })
  @Post('workflow/deposit/confirm')
  async confirmDeposit(@Body() dto: SubmitDepositTxDto) {
    return this.depositService.verifyAndConfirmDeposit(dto);
  }

  @ApiOperation({
    summary: '无 txHash 场景智能链上对账匹配 (Scan Matching Without TxHash)',
    description: '用户若未获取到 txHash (如交易所提币、外部扫码转账)，调用此接口触发服务端自动链上对账，核验收款钱包入账并直接结算用户余额。',
  })
  @ApiResponse({ status: 200, description: '智能对账匹配结果' })
  @Post('workflow/deposit/scan-matching')
  async scanMatchingDeposit(@Body() dto: ScanMatchDepositDto) {
    return this.depositService.scanAndMatchDeposit(dto);
  }

  @ApiOperation({
    summary: '发起用户提现出金 (Process Withdrawal)',
    description: '发起提现出金申请，系统从专属 WITHDRAW 热钱包池智能挑选满足余额条件的钱包，服务端签名并执行链上转账出款并返回 txHash。',
  })
  @ApiResponse({ status: 200, description: '出款成功，返回提现订单记录与 txHash' })
  @Post('workflow/withdraw')
  async processWithdrawal(@Body() dto: CreateWithdrawDto, @Req() req: Request) {
    // 若请求头携带 JWT 认证凭据，严格校验当前会话身份，防止冒领他人在途资产
    const authHeader = req?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ') && this.jwtService) {
      try {
        const token = authHeader.split(' ')[1]?.trim();
        const payload: any = await this.jwtService.verifyAsync(token);
        if (payload?.sub) {
          if (dto.userId && dto.userId !== payload.sub) {
            throw new ForbiddenException('越权访问：无权使用他人主账号发起提现');
          }
          dto.userId = payload.sub;
        }
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
      }
    }
    return this.withdrawService.processWithdrawal(dto);
  }

  @ApiOperation({
    summary: '查询提现订单链上确认进度 (Withdrawal Progress)',
    description: '查询服务端发起的提现链上转账确认状态及区块确认数。',
  })
  @ApiParam({ name: 'orderId', description: '提现订单 UUID' })
  @Get('workflow/withdraw/:orderId/progress')
  async getWithdrawalProgress(@Param('orderId') orderId: string) {
    return this.withdrawService.getWithdrawalProgress(orderId);
  }

  @ApiOperation({
    summary: '查询用户所有提现订单流水',
    description: '获取指定用户的多链提现订单记录。',
  })
  @ApiParam({ name: 'userId', description: '用户唯一主账号 ID' })
  @Get('workflow/withdrawals/user/:userId')
  async getUserWithdrawals(@Param('userId') userId: string) {
    return this.withdrawService.getUserWithdrawals(userId);
  }

  @ApiOperation({
    summary: '管理后台查询全平台提现订单流水 (Admin Withdrawals Ledger)',
  })
  @ApiBearerAuth('JWT-Admin-Auth')
  @UseGuards(AdminJwtAuthGuard)
  @Get('workflow/withdrawals')
  async getAllWithdrawals() {
    return this.withdrawService.getAllWithdrawals();
  }

  @ApiOperation({
    summary: '查询双轨对账引擎在途状态报告 (Dual-Track Reconciliation Report)',
    description: '返回当前在途订单、本地预计算 Hash、待救援 Nonce 与对账统计指标。',
  })
  @Get('workflow/reconciliation/status')
  async getReconciliationStatus() {
    return this.reconciliationService.getStatusReport();
  }

  @ApiOperation({
    summary: '手动立即触发在途订单对账巡检 (Trigger Manual Reconciliation)',
  })
  @ApiBearerAuth('JWT-Admin-Auth')
  @UseGuards(AdminJwtAuthGuard)
  @Post('workflow/reconciliation/run')
  async triggerReconciliation() {
    return this.reconciliationService.reconcileInFlightOrders();
  }
}
