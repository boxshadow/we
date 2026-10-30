import { ChainType } from '../../../common/enums/chain-type.enum.js';

export interface HttpRpcConfig {
  primaryUrl: string;
  fallbackUrls?: string[];
  headers?: Record<string, string>;
}

export interface WsRpcConfig {
  primaryUrl?: string;
  fallbackUrls?: string[];
  headers?: Record<string, string>;
}

export interface ContractConfig {
  dexRouterAddress?: string;
  dexFactoryAddress?: string;
  tokenLockerAddress?: string;
  wrappedNativeAddress?: string;
  customContracts?: Record<string, string>;
}

export interface NetworkSecurityConfig {
  minConfirmations: number;
  minDeposit?: string;
  minWithdraw?: string;
  isPaused: boolean;
}

export interface NetworkConfigEntity {
  networkId: string; // e.g. 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon', 'solana', 'tron'
  name: string; // e.g. 'Ethereum Mainnet', 'BNB Smart Chain'
  family: ChainType; // EVM | SOLANA | TRON
  chainId?: number; // e.g. 1, 56, 8453
  nativeCurrency: {
    name: string;
    symbol: string; // e.g. 'ETH', 'BNB', 'SOL', 'TRX'
    decimals: number;
  };
  httpRpc: HttpRpcConfig; // Channel 1: HTTP RPC (tx execution, state queries, contract calls)
  wsRpc: WsRpcConfig; // Channel 2: WS RPC (real-time price events, pending txs, confirmations)
  contracts: ContractConfig;
  security: NetworkSecurityConfig;
  createdAt: number;
  updatedAt: number;
}

export interface RpcHealthTestResult {
  networkId: string;
  family: ChainType;
  testedAt: number;
  http: {
    status: 'HEALTHY' | 'DEGRADED' | 'UNREACHABLE';
    url: string;
    latencyMs: number;
    latestBlock?: number | string;
    error?: string;
  };
  ws: {
    status: 'HEALTHY' | 'DEGRADED' | 'NOT_CONFIGURED' | 'UNREACHABLE';
    url?: string;
    latencyMs?: number;
    error?: string;
  };
}
