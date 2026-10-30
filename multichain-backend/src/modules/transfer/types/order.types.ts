import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainType } from '../../../common/enums/chain-type.enum.js';

export enum OrderStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export interface RawTxPayload {
  family: 'EVM' | 'TRON' | 'SOLANA';
  to: string;
  value: string;
  data: string;
  chainId?: number;
  chainIdHex?: string;
  tokenAddress?: string;
  depositAddress: string;
  amount: string;
  decimals: number;
  method: 'native' | 'transfer';
  contractParams?: any;
}

export interface DepositPipelineStep {
  step: number;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  detail?: string;
  timestamp?: number;
}

export interface DepositOrder {
  id: string;
  userId?: string;
  chain: ChainType | string;
  tokenSymbol?: string;
  tokenAddress?: string;
  depositAddress: string; // The dynamically picked Wallet A
  amount: string;
  actualAmount?: string;
  txHash?: string;
  fromAddress?: string;
  rawTx?: RawTxPayload;
  rawTxData?: string;
  blockNumber?: number;
  confirmations?: number;
  requiredConfirmations?: number;
  status: OrderStatus;
  credited?: boolean;
  pipelineSteps?: DepositPipelineStep[];
  createdAt: number;
  expiresAt: number; // e.g. 30 minutes TTL
  confirmedAt?: number;
}

export interface WithdrawPipelineStep {
  step: number;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  detail?: string;
  timestamp?: number;
}

export interface WithdrawOrder {
  id: string;
  userId?: string;
  network: string;
  chain: ChainType | string;
  fromVault: string; // The randomly picked Vault Wallet
  toAddress: string;   // User's destination address
  amount: string;
  tokenSymbol?: string;
  tokenAddress?: string;
  txHash?: string;
  nonce?: number;      // 方案 C: 链上出资分配的单调自增 Nonce，用于无响应时的 Nonce 探测挽救
  signedRawTx?: string;// 方案 C: 已签名的原始交易体，用于对冲广播与同 Nonce 冲正
  isPreCalculated?: boolean; // 是否采用本地确定性预计算 Hash
  isInFlight?: boolean;      // 是否处于广播无响应在途对账态
  inFlightReason?: string;
  rescueAttempts?: number;
  blockNumber?: number;
  confirmations?: number;
  requiredConfirmations?: number;
  status: OrderStatus;
  errorMessage?: string;
  pipelineSteps?: WithdrawPipelineStep[];
  createdAt: number;
  confirmedAt?: number;
}

export class CreateDepositDto {
  @ApiPropertyOptional({
    description: '用户主账号 UUID (若已登录)',
    example: '3e795879-7b6e-4811-8d9f-ae3bc3b85dfb',
  })
  userId?: string;

  @ApiProperty({
    description: '网络名称或链生态标识 (如 ethereum, bsc, solana, tron)',
    example: 'ethereum',
  })
  network!: ChainType | string;

  @ApiProperty({
    description: '充值金额字符串 (防止浮点数精度丢失)',
    example: '100.5',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: '充值代币符号 (如 USDT, USDC, ETH, SOL, TRX)',
    example: 'USDT',
  })
  tokenSymbol?: string;

  @ApiPropertyOptional({
    description: '充值代币合约地址 (若不填根据 tokenSymbol 自动解析或默认为原生币)',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  tokenAddress?: string;
}

export class SubmitDepositTxDto {
  @ApiProperty({
    description: '充值订单编号 (UUID)',
    example: 'c75895ff-3972-40dc-83db-da44e704b16e',
  })
  orderId!: string;

  @ApiProperty({
    description: '用户在钱包中广播转账产生的链上交易哈希 txHash',
    example: '0x3a4b...txHash',
  })
  txHash!: string;
}

export class ScanMatchDepositDto {
  @ApiProperty({
    description: '充值订单编号 (UUID)',
    example: 'c75895ff-3972-40dc-83db-da44e704b16e',
  })
  orderId!: string;

  @ApiPropertyOptional({
    description: '用户发起付款的钱包源地址 (可选，便于快速精准匹配)',
    example: '0xUserPayerAddress1111111111111111111111',
  })
  fromAddress?: string;
}

export class CreateWithdrawDto {
  @ApiPropertyOptional({
    description: '用户主账号 UUID',
    example: '3e795879-7b6e-4811-8d9f-ae3bc3b85dfb',
  })
  userId?: string;

  @ApiProperty({
    description: '提现出金目标网络 (如 ethereum, bsc, solana, tron)',
    example: 'ethereum',
  })
  network!: ChainType | string;

  @ApiProperty({
    description: '用户的接收地址',
    example: '0xUserDestinationAddress111111111111111111',
  })
  userAddress!: string;

  @ApiProperty({
    description: '提现出金金额',
    example: '50.0',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: '提现代币合约地址 (不填代表出金原生币)',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  tokenAddress?: string;
}

export class CreateWithdrawalDto {
  @ApiPropertyOptional({
    description: '用户主账号 UUID',
    example: '3e795879-7b6e-4811-8d9f-ae3bc3b85dfb',
  })
  userId?: string;

  @ApiProperty({
    description: '提现出金目标网络 (如 ethereum, bsc, solana, tron)',
    example: 'ethereum',
  })
  network!: string;

  @ApiProperty({
    description: '提现代币符号 (如 USDT, ETH, TRX, SOL)',
    example: 'USDT',
  })
  tokenSymbol!: string;

  @ApiPropertyOptional({
    description: '提现代币合约地址 (可选，不传由 tokenSymbol 自动确定)',
    example: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  })
  tokenAddress?: string;

  @ApiProperty({
    description: '用户的接收钱包公钥地址',
    example: '0x36b8a47da48830b42a04156ec6990b015ffbfa39',
  })
  toAddress!: string;

  @ApiProperty({
    description: '提现金额 (字符串)',
    example: '50.0',
  })
  amount!: string;

  @ApiPropertyOptional({
    description: '客户端业务幂等键 (防重复点击与网络重放，建议为 UUID)',
    example: 'idem-4f73892a-3c0f-4889-b788-bcf6b3491122',
  })
  idempotencyKey?: string;
}
