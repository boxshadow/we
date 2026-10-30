import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChainType } from '../../../common/enums/chain-type.enum.js';
import type {
  HttpRpcConfig,
  WsRpcConfig,
  ContractConfig,
  NetworkSecurityConfig,
} from '../interfaces/network-config.interface.js';

export class CreateNetworkDto {
  @ApiProperty({ description: '网络唯一英文标识符 (唯一主键)', example: 'arbitrum' })
  networkId!: string;

  @ApiProperty({ description: '网络显示名称', example: 'Arbitrum One' })
  name!: string;

  @ApiProperty({ enum: ChainType, description: '公链大类家族 (EVM / SOLANA / TRON)', example: 'EVM' })
  family!: ChainType;

  @ApiPropertyOptional({ description: 'EVM 规范的 Chain ID (EVM 链必填)', example: 42161 })
  chainId?: number;

  @ApiProperty({
    type: Object,
    description: '底层原生币元数据',
    example: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  })
  nativeCurrency!: {
    name: string;
    symbol: string;
    decimals: number;
  };

  @ApiProperty({
    type: Object,
    description: 'HTTP RPC 节点配置 (主节点及备用节点列表)',
    example: {
      primaryUrl: 'https://arb1.arbitrum.io/rpc',
      fallbackUrls: ['https://rpc.ankr.com/arbitrum'],
      timeoutMs: 10000,
    },
  })
  httpRpc!: HttpRpcConfig;

  @ApiPropertyOptional({
    type: Object,
    description: 'WebSocket RPC 节点配置 (主节点及自动重连)',
    example: {
      primaryUrl: 'wss://arb1.arbitrum.io/feed',
      reconnectIntervalMs: 5000,
    },
  })
  wsRpc?: WsRpcConfig;

  @ApiPropertyOptional({
    type: Object,
    description: '常用协议合约地址配置 (Router, Factory, Locker)',
    example: {
      routerAddress: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    },
  })
  contracts?: ContractConfig;

  @ApiPropertyOptional({
    type: Object,
    description: '网络安全与限流配置 (熔断状态、最大单笔额度)',
    example: {
      isPaused: false,
      maxTransferLimitPerTx: '1000000',
    },
  })
  security?: Partial<NetworkSecurityConfig>;
}

export class UpdateNetworkDto {
  @ApiPropertyOptional({ description: '网络显示名称', example: 'Arbitrum One (Updated)' })
  name?: string;

  @ApiPropertyOptional({ description: 'EVM Chain ID', example: 42161 })
  chainId?: number;

  @ApiPropertyOptional({ type: Object, description: '原生币元数据' })
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };

  @ApiPropertyOptional({ type: Object, description: '热替换 HTTP 节点配置' })
  httpRpc?: Partial<HttpRpcConfig>;

  @ApiPropertyOptional({ type: Object, description: '热替换 WS 节点配置' })
  wsRpc?: Partial<WsRpcConfig>;

  @ApiPropertyOptional({ type: Object, description: '合约地址更新' })
  contracts?: Partial<ContractConfig>;

  @ApiPropertyOptional({ type: Object, description: '安全与限流更新' })
  security?: Partial<NetworkSecurityConfig>;
}
