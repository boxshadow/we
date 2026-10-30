import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainType } from '../../../common/enums/chain-type.enum.js';

export class GetNonceDto {
  @ApiProperty({
    enum: ChainType,
    description: '公链生态类型',
    example: 'EVM',
  })
  chain!: ChainType;

  @ApiProperty({
    description: '用户钱包公钥地址 (0x... 或 Solana/Tron 地址)',
    example: '0x1111111111111111111111111111111111111111',
  })
  address!: string;

  @ApiPropertyOptional({
    description: '可选的网络标识符 (如 ethereum, bsc, base 等)',
    example: 'ethereum',
  })
  networkId?: string;
}

export class LoginWalletDto {
  @ApiProperty({
    enum: ChainType,
    description: '公链生态类型 (EVM / SOLANA / TRON)',
    example: 'EVM',
  })
  chain!: ChainType;

  @ApiProperty({
    description: '用于登录的钱包地址',
    example: '0x1111111111111111111111111111111111111111',
  })
  address!: string;

  @ApiProperty({
    description: '钱包私钥对 message 签名后生成的十六进制或 Base58 签名字符串',
    example: '0x3f5b...4a1c',
  })
  signature!: string;

  @ApiProperty({
    description: '从 /api/auth/nonce 获取的完整未被篡改的挑战文本',
    example: 'localhost wants you to sign in with your EVM account:\n0x1111...',
  })
  message!: string;

  @ApiPropertyOptional({
    description: '所属网络标识符 (如 ethereum, bsc, solana, tron)',
    example: 'ethereum',
  })
  networkId?: string;
}

export class BindWalletDto {
  @ApiProperty({
    enum: ChainType,
    description: '待绑定的新钱包链类型 (EVM / SOLANA / TRON)',
    example: 'SOLANA',
  })
  chain!: ChainType;

  @ApiProperty({
    description: '待绑定的新钱包地址',
    example: 'SolanaWalletAddress11111111111111111111111111',
  })
  address!: string;

  @ApiProperty({
    description: '新钱包私钥对挑战 message 的数字签名',
    example: '5J4...base58_sig',
  })
  signature!: string;

  @ApiProperty({
    description: '从 /api/auth/nonce 获取的针对待绑定地址的挑战文本',
    example: 'localhost wants you to sign in with your SOLANA account:\nSolana...',
  })
  message!: string;

  @ApiPropertyOptional({
    description: '所属网络标识符',
    example: 'solana',
  })
  networkId?: string;
}

export class UnbindWalletDto {
  @ApiProperty({
    enum: ChainType,
    description: '待解绑钱包所属的链生态 (EVM / SOLANA / TRON)',
    example: 'SOLANA',
  })
  chain!: ChainType;

  @ApiProperty({
    description: '待解绑的钱包地址',
    example: 'SolanaWalletAddress11111111111111111111111111',
  })
  address!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: '登录或上次刷新获得的有效 refresh_token (有效期7天)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}
