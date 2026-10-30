import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TxStatus } from '../enums/tx-status.enum.js';
import type { WalletAccount } from '../../modules/wallet/interfaces/wallet-account.interface.js';

export interface TxResult {
  success: boolean;
  txHash: string;
  blockNumber?: number | bigint;
  error?: string;
  rawReceipt?: any;
  nonce?: number;
  isInFlight?: boolean;
  signedRawTx?: string;
  warning?: string;
}

export interface VerifyTxResult {
  confirmed: boolean;
  blockNumber?: number;
  status: TxStatus;
  from?: string;
  to?: string;
  amount?: string;
  tokenAddress?: string;
  rawReceipt?: any;
}

export class TransferDto {
  @ApiProperty({ description: '收款人地址 (0x... / Solana / Tron)', example: '0xReceivingAddress111111111111111111111111' })
  to!: string;

  @ApiProperty({ description: '转账金额 (字符串格式，防精度丢失)', example: '10.5' })
  amount!: string;

  @ApiPropertyOptional({ description: '代币合约地址 (若不填则转账原生币 ETH/SOL/TRX)', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' })
  tokenAddress?: string;

  @ApiPropertyOptional({ description: '具体网络标识符 (如 ethereum, bsc, base)', example: 'ethereum' })
  networkId?: string;

  signerWallet?: WalletAccount;
}

export class TokenDeployDto {
  @ApiProperty({ description: '代币全称 (Token Name)', example: 'My Security Token' })
  name!: string;

  @ApiProperty({ description: '代币代码 (Token Symbol)', example: 'MST' })
  symbol!: string;

  @ApiProperty({ description: '代币小数精度 (Decimals)', example: 18 })
  decimals!: number;

  @ApiProperty({ description: '初始铸造发行总量 (字符串大数)', example: '10000000' })
  initialSupply!: string;

  @ApiPropertyOptional({ description: '代币接收者地址 (若不填默认发行至部署钱包)', example: '0xRecipientAddress11111111111111111111111' })
  recipient?: string;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;

  signerWallet?: WalletAccount;
}

export class AddLiquidityDto {
  @ApiProperty({ description: '代币 A 合约地址 (原生币填 NATIVE 或特定包装代币)', example: '0xTokenAAddress111111111111111111111111111' })
  tokenA!: string;

  @ApiProperty({ description: '代币 B 合约地址', example: '0xTokenBAddress222222222222222222222222222' })
  tokenB!: string;

  @ApiProperty({ description: '代币 A 注入数量', example: '100.0' })
  amountA!: string;

  @ApiProperty({ description: '代币 B 注入数量', example: '30000.0' })
  amountB!: string;

  @ApiProperty({ description: 'LP 凭证接收人地址', example: '0xLpRecipientAddress33333333333333333333333' })
  recipient!: string;

  @ApiPropertyOptional({ description: '滑点保护百分比 (默认 0.5%)', example: 0.5 })
  slippagePercent?: number;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;
}

export class RemoveLiquidityDto {
  @ApiProperty({ description: '流动性池 Pair 合约地址', example: '0xPoolPairAddress444444444444444444444444444' })
  poolAddress!: string;

  @ApiProperty({ description: '待销毁赎回的 LP 凭证数量', example: '50.0' })
  lpAmount!: string;

  @ApiProperty({ description: '底层资产接收人地址', example: '0xRecipientAddress5555555555555555555555555' })
  recipient!: string;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;
}

export class SwapDto {
  @ApiProperty({ description: '输入代币 (支付代币) 合约地址', example: '0xTokenInAddress111111111111111111111111111' })
  tokenIn!: string;

  @ApiProperty({ description: '输出代币 (目标代币) 合约地址', example: '0xTokenOutAddress22222222222222222222222222' })
  tokenOut!: string;

  @ApiProperty({ description: '支付数量', example: '10.0' })
  amountIn!: string;

  @ApiProperty({ description: '最小获得数量 (滑点保护)', example: '9.8' })
  minAmountOut!: string;

  @ApiProperty({ description: '兑换后代币接收人地址', example: '0xRecipientAddress33333333333333333333333' })
  recipient!: string;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;
}

export class LockDto {
  @ApiProperty({ description: '锁定标的代币或 LP 凭证合约地址', example: '0xTokenOrLpAddress11111111111111111111111' })
  tokenAddress!: string;

  @ApiProperty({ description: '锁定数量 (字符串大数)', example: '1000000.0' })
  amount!: string;

  @ApiProperty({ description: '解锁到期时间戳 (秒或毫秒 UNIX Timestamp)', example: 1799999999 })
  unlockTimestamp!: number;

  @ApiProperty({ description: '锁仓到期后的解锁受益人地址', example: '0xBeneficiaryAddress2222222222222222222222' })
  beneficiary!: string;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;
}

export class UnlockDto {
  @ApiProperty({ description: '已锁定的代币或 LP 合约地址', example: '0xTokenOrLpAddress11111111111111111111111' })
  tokenAddress!: string;

  @ApiProperty({ description: '锁仓订单或合约记录对应的 lockId', example: 'lock-evm-001' })
  lockId!: string;

  @ApiProperty({ description: '申请解锁提取的数量', example: '1000000.0' })
  amount!: string;

  @ApiProperty({ description: '提取资产接收人地址 (必须与原受益人匹配)', example: '0xBeneficiaryAddress2222222222222222222222' })
  recipient!: string;

  @ApiPropertyOptional({ description: '目标网络标识符', example: 'ethereum' })
  networkId?: string;

  signerWallet?: WalletAccount;
}

export interface PriceResult {
  tokenAddress: string;
  priceUsd: number;
  quoteTokenAddress?: string;
  timestamp: number;
}
